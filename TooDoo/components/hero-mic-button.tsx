import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const ORB = 108;
const RING = 240;
const CX = RING / 2;
const CY = RING / 2;
const ARC_R = 92;
// How far left/right the wave trails sit from the exact center.
// Reducing this pushes the waves closer together.
const WAVE_SIDE_OFFSET = 3;
const GLOW_SIZE = ORB + 48;
const HERO_NAVY = '#0e1325';
const SIDE_DECOR_W = 76;
const SIDE_DECOR_H = 220;

/** Static accents on the left/right screen edges, outside the wave ring. */
function HeroSideDecor({ side }: { side: 'left' | 'right' }) {
  const bars = [
    { x: 10, y: 72, h: 22, o: 0.14 },
    { x: 20, y: 58, h: 36, o: 0.2 },
    { x: 30, y: 64, h: 30, o: 0.16 },
    { x: 40, y: 50, h: 44, o: 0.24 },
    { x: 50, y: 68, h: 26, o: 0.12 },
    { x: 60, y: 56, h: 38, o: 0.18 },
  ];

  return (
    <Svg
      width={SIDE_DECOR_W}
      height={SIDE_DECOR_H}
      viewBox={`0 0 ${SIDE_DECOR_W} ${SIDE_DECOR_H}`}
      style={side === 'left' ? styles.sideDecorLeft : styles.sideDecorRight}
      pointerEvents="none"
    >
      <Defs>
        <SvgGradient id={`sideFade-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#6c9ef5" stopOpacity="0.28" />
          <Stop offset="100%" stopColor="#6c9ef5" stopOpacity="0" />
        </SvgGradient>
      </Defs>

      <G transform={side === 'right' ? `translate(${SIDE_DECOR_W}, 0) scale(-1, 1)` : undefined}>
        <Path
          d="M -8 36 Q 42 110 18 188"
          stroke={`url(#sideFade-${side})`}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M -24 96 A 88 88 0 0 1 52 168"
          stroke="#478beb"
          strokeOpacity={0.1}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
        {bars.map((bar, index) => (
          <Path
            key={index}
            d={`M ${bar.x} ${bar.y} L ${bar.x} ${bar.y + bar.h}`}
            stroke="#b8d4ff"
            strokeOpacity={bar.o}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        <Circle cx={14} cy={132} r={3} fill="#6c9ef5" opacity={0.2} />
        <Circle cx={28} cy={148} r={2} fill="#8eb5f5" opacity={0.16} />
        <Circle cx={46} cy={126} r={2.5} fill="#478beb" opacity={0.14} />
      </G>
    </Svg>
  );
}

type Pt = { x: number; y: number };

/** Smooth open spline through points. */
function smoothOpen(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Irregular audio-visualizer sample in [-1, 1] with mixed peak heights. */
function audioSample(t: number, phase: number): number {
  const s =
    Math.sin(t * Math.PI * 10 + phase) * 0.52 +
    Math.sin(t * Math.PI * 16 + phase * 1.45) * 0.3 +
    Math.sin(t * Math.PI * 25 + phase * 0.7) * 0.2 +
    Math.sin(t * Math.PI * 37 + phase * 2.15) * 0.14 +
    Math.sin(t * Math.PI * 7 + phase * 0.35) * 0.18;
  // Sharper peaks / flatter troughs — more like a voice waveform.
  const sharp = Math.sign(s) * Math.pow(Math.abs(Math.min(1, Math.abs(s))), 0.65);
  // Local amplitude so some regions spike high while others stay quiet.
  const localAmp =
    0.4 +
    0.38 * Math.sin(t * Math.PI * 2.15 + phase * 0.55) +
    0.28 * Math.sin(t * Math.PI * 3.7 + phase * 1.15);
  return sharp * Math.max(0.12, localAmp);
}

/**
 * Audio-style waveform along a circular half.
 * Biggest peaks in the middle; amplitude falls off toward the stationary tips.
 */
function waveTrail(side: -1 | 1, phase: number, steps = 56): string {
  const start = side < 0 ? 115 : -65;
  const end = side < 0 ? 245 : 65;
  const amp = 24;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const deg = start + (end - start) * t;
    const rad = (deg * Math.PI) / 180;
    // Strong center-weighted falloff — large in the middle, tiny near the edges.
    const envelope = Math.pow(Math.sin(t * Math.PI), 2.4);
    const ripple = audioSample(t, phase) * amp * envelope;
    const r = ARC_R + ripple;
    pts.push({
      x: CX + Math.cos(rad) * r,
      y: CY + Math.sin(rad) * r,
    });
  }
  return smoothOpen(pts);
}

function GradientText({
  children,
  style,
  colors,
}: {
  children: string;
  style?: object;
  colors: [string, string, ...string[]];
}) {
  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          style,
          {
            // CSS gradient fill for web (MaskedView is flaky there).
            color: 'transparent',
            // @ts-expect-error web-only CSS
            backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          },
        ]}
      >
        {children}
      </Text>
    );
  }

  return (
    <MaskedView
      style={{ flexDirection: 'row' }}
      maskElement={
        <Text style={[style, { backgroundColor: 'transparent' }]}>{children}</Text>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/**
 * Logged-in home hero — mic CTA matching the TooDoo voice-search mock.
 */
export function HeroMicButton({
  height,
  backgroundColor = HERO_NAVY,
  topInset = 0,
  onPress,
}: {
  height: number;
  backgroundColor?: string;
  topInset?: number;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  textColor?: string;
  mutedColor?: string;
  onPress?: () => void;
}) {
  const [phase, setPhase] = useState(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastStep = -1;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;
      phaseRef.current += dt * 0.0048;
      const step = Math.round(phaseRef.current * 36) / 36;
      if (step !== lastStep) {
        lastStep = step;
        setPhase(step);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const trails = useMemo(
    () => ({
      left: waveTrail(-1, phase),
      right: waveTrail(1, phase + 1.1),
    }),
    [phase]
  );

  return (
    <View style={[styles.shell, { height, backgroundColor, paddingTop: topInset }]}>
      <View style={styles.sideDecorLayer} pointerEvents="none">
        <HeroSideDecor side="left" />
        <HeroSideDecor side="right" />
      </View>
      <View style={styles.content}>
        <View style={styles.headlineRow}>
          <Text style={styles.headline}>Vad vill du göra </Text>
          <GradientText
            style={styles.headline}
            colors={['#c5dcff', '#6c9ef5', '#478beb']}
          >
            idag?
          </GradientText>
        </View>

        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Prata med TooDoo"
          hitSlop={12}
          style={styles.micPressable}
        >
          <View style={styles.micWrap}>
            {/* Soft radial bloom — fades out, no hard edge */}
            <Svg
              width={GLOW_SIZE}
              height={GLOW_SIZE}
              style={styles.orbGlow}
              pointerEvents="none"
            >
              <Defs>
                <RadialGradient id="micBloom" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#8eb5f5" stopOpacity="0.42" />
                  <Stop offset="40%" stopColor="#478beb" stopOpacity="0.22" />
                  <Stop offset="100%" stopColor="#478beb" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle
                cx={GLOW_SIZE / 2}
                cy={GLOW_SIZE / 2}
                r={GLOW_SIZE / 2}
                fill="url(#micBloom)"
              />
            </Svg>

            <Svg
              width={RING}
              height={RING}
              viewBox={`0 0 ${RING} ${RING}`}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <Defs>
                <SvgGradient id="arcLeft" x1="0%" y1="100%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#8eb5f5" />
                  <Stop offset="100%" stopColor="#478beb" />
                </SvgGradient>
                <SvgGradient id="arcRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#b8d4ff" />
                  <Stop offset="100%" stopColor="#3a7fe0" />
                </SvgGradient>
              </Defs>
              {/* Soft bloom behind the wave lines */}
              <G transform={`translate(${-WAVE_SIDE_OFFSET}, 0)`}>
                <Path
                  d={trails.left}
                  stroke="url(#arcLeft)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.22}
                />
                <Path
                  d={trails.left}
                  stroke="url(#arcLeft)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.95}
                />
              </G>
              <G transform={`translate(${WAVE_SIDE_OFFSET}, 0)`}>
                <Path
                  d={trails.right}
                  stroke="url(#arcRight)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.22}
                />
                <Path
                  d={trails.right}
                  stroke="url(#arcRight)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.95}
                />
              </G>
            </Svg>

            <View style={styles.orbShadow}>
              <View style={styles.orbRing}>
                <View style={styles.orb}>
                  <LinearGradient
                    colors={['#b8d4ff', '#6c9ef5', '#478beb']}
                    locations={[0, 0.42, 1]}
                    start={{ x: 0.35, y: 0 }}
                    end={{ x: 0.65, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.1)', 'transparent']}
                    locations={[0, 0.22, 0.55]}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.75, y: 0.85 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <Ionicons name="mic" size={54} color="#ffffff" />
                </View>
              </View>
            </View>
          </View>
        </Pressable>

        <Text style={styles.talkTitle}>Prata med TooDoo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    position: 'relative',
  },
  sideDecorLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  sideDecorLeft: {
    position: 'absolute',
    left: 0,
    top: '28%',
  },
  sideDecorRight: {
    position: 'absolute',
    right: 0,
    top: '28%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    zIndex: 1,
  },
  headlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  headline: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 34,
  },
  micPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    marginTop: -8,
  },
  micWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  orbShadow: {
    borderRadius: ORB / 2 + 4,
    shadowColor: '#6c9ef5',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  orbRing: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  talkTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginTop: -10,
  },
});
