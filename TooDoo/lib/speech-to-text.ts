import { Platform } from 'react-native';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export type SpeechToTextSession = {
  stop: () => void;
  done: Promise<string>;
};

export type SpeechSupportInfo = {
  supported: boolean;
  secure: boolean;
  hasApi: boolean;
  browser: 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';
  reason?: string;
};

const DEFAULT_SILENCE_TIMEOUT_MS = 1000;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function detectBrowser(): SpeechSupportInfo['browser'] {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/firefox\/\d+/i.test(ua)) return 'firefox';
  if (/edg\/\d+/i.test(ua)) return 'edge';
  if (/chrome\/\d+/i.test(ua) && !/edg\/\d+/i.test(ua)) return 'chrome';
  if (/safari\/\d+/i.test(ua) && !/chrome\/\d+/i.test(ua)) return 'safari';
  return 'other';
}

export function isSpeechSecureContext(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return true;
  }
  return window.isSecureContext;
}

export function hasSpeechRecognition(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function getSpeechSupportInfo(): SpeechSupportInfo {
  const browser = detectBrowser();
  const secure = isSpeechSecureContext();
  const hasApi = hasSpeechRecognition();

  if (Platform.OS !== 'web') {
    return {
      supported: false,
      secure,
      hasApi: false,
      browser,
      reason: 'Röstsökning fungerar just nu i webbläsaren (Chrome eller Edge).',
    };
  }

  if (!secure) {
    return {
      supported: false,
      secure,
      hasApi,
      browser,
      reason:
        'Röstsökning kräver HTTPS eller localhost. Öppna http://localhost:8081 (inte LAN-IP).',
    };
  }

  if (browser === 'firefox') {
    return {
      supported: false,
      secure,
      hasApi,
      browser,
      reason:
        'Firefox stödjer inte röstigenkänning ännu. Öppna TooDoo i Google Chrome eller Microsoft Edge.',
    };
  }

  if (!hasApi) {
    return {
      supported: false,
      secure,
      hasApi,
      browser,
      reason:
        'Din webbläsare stödjer inte röstigenkänning. Prova Google Chrome eller Microsoft Edge.',
    };
  }

  return { supported: true, secure, hasApi, browser };
}

export function isSpeechToTextSupported(): boolean {
  return getSpeechSupportInfo().supported;
}

/**
 * Start speech recognition (Web Speech API / Chrome).
 * Must be called synchronously from a real click/tap handler.
 * Auto-stops after `silenceTimeoutMs` of silence (default 1s).
 */
export function startSpeechToText(options?: {
  lang?: string;
  continuous?: boolean;
  /** Stop after this many ms without speech activity. Default 1000. */
  silenceTimeoutMs?: number;
  onPartial?: (text: string) => void;
  onListening?: () => void;
}): SpeechToTextSession {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return {
      stop: () => undefined,
      done: Promise.reject(new Error('SPEECH_UNSUPPORTED')),
    };
  }

  let recognition: SpeechRecognitionLike | null = null;
  let settled = false;
  let stopping = false;
  let finalText = '';
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDone!: (text: string) => void;
  let rejectDone!: (error: Error) => void;

  const done = new Promise<string>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const silenceTimeoutMs = options?.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const requestStop = () => {
    if (settled || stopping) return;
    stopping = true;
    clearSilenceTimer();
    try {
      recognition?.stop();
    } catch {
      finish(finalText);
    }
  };

  const armSilenceTimer = () => {
    if (settled || stopping) return;
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      requestStop();
    }, silenceTimeoutMs);
  };

  const noteSpeechActivity = () => {
    // While the user is speaking, don't count silence.
    clearSilenceTimer();
  };

  const finish = (text: string, error?: Error) => {
    if (settled) return;
    settled = true;
    stopping = true;
    clearSilenceTimer();
    const active = recognition;
    recognition = null;
    try {
      active?.abort();
    } catch {
      // ignore
    }
    if (error) {
      rejectDone(error);
    } else {
      resolveDone(text.trim());
    }
  };

  const continuous = options?.continuous ?? true;

  try {
    recognition = new Ctor();
    recognition.lang = options?.lang ?? 'sv-SE';
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onaudiostart = () => {
      options?.onListening?.();
      // No speech yet — turn off after silence timeout if user stays quiet.
      armSilenceTimer();
    };

    recognition.onsoundstart = () => {
      noteSpeechActivity();
    };

    recognition.onspeechstart = () => {
      noteSpeechActivity();
    };

    recognition.onsoundend = () => {
      armSilenceTimer();
    };

    recognition.onspeechend = () => {
      armSilenceTimer();
    };

    recognition.onresult = (event) => {
      noteSpeechActivity();
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]?.[0]?.transcript ?? '';
        if (event.results[i]?.isFinal) {
          finalText = `${finalText} ${piece}`.trim();
        } else {
          interim = `${interim} ${piece}`.trim();
        }
      }
      const display = (finalText || interim).trim();
      if (display) {
        options?.onPartial?.(display);
      }
      // After each result chunk, wait again for silence.
      armSilenceTimer();
    };

    recognition.onerror = (event) => {
      const code = event?.error ?? 'unknown';
      if (code === 'aborted') {
        return;
      }
      // Browser-level no-speech: treat as silence and let our timer / stop handle end.
      if (code === 'no-speech') {
        armSilenceTimer();
        return;
      }
      finish(finalText, new Error(code));
    };

    recognition.onend = () => {
      if (settled) return;
      if (stopping) {
        finish(finalText);
        return;
      }
      if (!continuous) {
        finish(finalText);
        return;
      }
      try {
        recognition?.start();
      } catch {
        // InvalidStateError: already started
      }
    };

    // Keep this in the same turn as the user gesture.
    recognition.start();
  } catch (error) {
    finish(
      '',
      error instanceof Error ? error : new Error('SPEECH_START_FAILED')
    );
  }

  return {
    stop: () => {
      requestStop();
    },
    done,
  };
}
