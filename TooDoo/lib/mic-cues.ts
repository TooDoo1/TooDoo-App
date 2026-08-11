import { Platform } from 'react-native';

type MicCue = 'on' | 'off';

type AudioContextCtor = new () => AudioContext;

let sharedCtx: AudioContext | null = null;

function getAudioContextCtor(): AudioContextCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const w = window as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  options: {
    type: OscillatorType;
    startFreq: number;
    endFreq: number;
    startAt: number;
    duration: number;
    peakGain: number;
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const { type, startFreq, endFreq, startAt, duration, peakGain } = options;
  const endAt = startAt + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startAt);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 80), endAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(endAt + 0.02);
}

function runCue(kind: MicCue): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const start = () => {
    try {
      // currentTime can be 0 right after resume; nudge slightly so ramps apply.
      const now = Math.max(ctx.currentTime, 0) + 0.02;

      if (kind === 'on') {
        // Bright rising chirp.
        playTone(ctx, {
          type: 'sine',
          startFreq: 740,
          endFreq: 1100,
          startAt: now,
          duration: 0.11,
          peakGain: 0.22,
        });
        return;
      }

      // Darker stop tone — lower + softer timbre, but still in laptop-speaker range.
      playTone(ctx, {
        type: 'triangle',
        startFreq: 460,
        endFreq: 260,
        startAt: now,
        duration: 0.18,
        peakGain: 0.28,
      });
    } catch {
      // Ignore audio failures.
    }
  };

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(start)
      .catch(() => undefined);
    return;
  }
  start();
}

/**
 * Mic on/off UI cues (generated, no asset files).
 * Off can be delayed so it plays after SpeechRecognition releases the audio device.
 */
export function playMicCue(kind: MicCue, options?: { delayMs?: number }): void {
  if (Platform.OS !== 'web') return;
  const delayMs = options?.delayMs ?? 0;
  if (delayMs > 0) {
    window.setTimeout(() => runCue(kind), delayMs);
    return;
  }
  runCue(kind);
}
