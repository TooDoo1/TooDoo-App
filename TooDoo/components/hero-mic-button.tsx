import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const ORB = 88;
const GLOW_SIZE = ORB + 64;
const OUTER_GLOW_SIZE = ORB + 96;
const HERO_NAVY = '#0e1325';
/** Circular wave ring around the mic. */
const RING = 200;
const CX = RING / 2;
const CY = RING / 2;
const ARC_R = 74;
const WAVE_SIDE_OFFSET = 3;

type Pt = { x: number; y: number };

/**
 * Standing on the street, looking up: low ground VP, tall towers, plumb verticals.
 */
const VP_GROUND = { x: 200, y: 268 };
const GROUND_Y = 320;
/** Near curb — open street underfoot */
const CURB_L = 58;
const CURB_R = 342;
const WALL_L = -20;
const WALL_R = 420;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** depth 0 = at feet, 1 = far / horizon */
function depthPoint(nearX: number, depth: number): Pt {
  return {
    x: lerp(nearX, VP_GROUND.x, depth),
    y: lerp(GROUND_Y, VP_GROUND.y, depth),
  };
}

function scaleAt(depth: number) {
  return Math.max(0.1, 1 - depth * 0.86);
}

/**
 * Facade point: base on curb, edges stay straight (plumb).
 */
function facadePoint(
  side: 'left' | 'right',
  depth: number,
  heightFrac: number,
  buildingHeight: number,
): Pt {
  const curb = depthPoint(side === 'left' ? CURB_L : CURB_R, depth);
  const outer = depthPoint(side === 'left' ? WALL_L : WALL_R, depth);
  const x = lerp(outer.x, curb.x, 0.18);
  const h = buildingHeight * scaleAt(depth) * (1 + (1 - depth) * 0.22);
  const y = curb.y - h * heightFrac;
  return { x, y };
}

type StreetBuilding = {
  side: 'left' | 'right';
  d0: number;
  d1: number;
  height: number;
  neon: string;
  seed: number;
};

const STREET_BUILDINGS: StreetBuilding[] = [
  // Tall near towers — loom over you from the curb
  { side: 'left', d0: 0.01, d1: 0.13, height: 240, neon: '#67e8f9', seed: 1 },
  { side: 'left', d0: 0.14, d1: 0.26, height: 195, neon: '#c084fc', seed: 2 },
  { side: 'left', d0: 0.27, d1: 0.4, height: 255, neon: '#f472b6', seed: 3 },
  { side: 'left', d0: 0.41, d1: 0.52, height: 165, neon: '#a78bfa', seed: 4 },
  { side: 'left', d0: 0.53, d1: 0.63, height: 210, neon: '#67e8f9', seed: 5 },
  { side: 'left', d0: 0.64, d1: 0.73, height: 145, neon: '#fb923c', seed: 6 },
  { side: 'left', d0: 0.74, d1: 0.82, height: 175, neon: '#e879f9', seed: 7 },
  { side: 'right', d0: 0.01, d1: 0.13, height: 235, neon: '#f472b6', seed: 8 },
  { side: 'right', d0: 0.14, d1: 0.26, height: 200, neon: '#67e8f9', seed: 9 },
  { side: 'right', d0: 0.27, d1: 0.39, height: 250, neon: '#c084fc', seed: 10 },
  { side: 'right', d0: 0.4, d1: 0.51, height: 158, neon: '#fb923c', seed: 11 },
  { side: 'right', d0: 0.52, d1: 0.62, height: 205, neon: '#a78bfa', seed: 12 },
  { side: 'right', d0: 0.63, d1: 0.72, height: 140, neon: '#67e8f9', seed: 13 },
  { side: 'right', d0: 0.73, d1: 0.82, height: 180, neon: '#e879f9', seed: 14 },
];

function quadPath(a: Pt, b: Pt, c: Pt, d: Pt) {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${c.x.toFixed(1)} ${c.y.toFixed(1)} L ${d.x.toFixed(1)} ${d.y.toFixed(1)} Z`;
}

function buildingQuad(b: StreetBuilding): string {
  return quadPath(
    facadePoint(b.side, b.d0, 0, b.height),
    facadePoint(b.side, b.d1, 0, b.height),
    facadePoint(b.side, b.d1, 1, b.height),
    facadePoint(b.side, b.d0, 1, b.height),
  );
}

function hash(seed: number, a: number, b: number) {
  return ((seed * 73856093) ^ (a * 19349663) ^ (b * 83492791)) >>> 0;
}

type BuildingLight = {
  d: string;
  color: string;
  o: number;
  kind: 'window' | 'windowGlow' | 'shop' | 'sign';
};

function buildingLights(b: StreetBuilding): BuildingLight[] {
  const out: BuildingLight[] = [];
  const cols = 4;
  const rows = 11;
  const avgDepth = (b.d0 + b.d1) / 2;
  const depthFade = 0.55 + scaleAt(avgDepth) * 0.45;

  const warmTones = ['#f6ecd8', '#ebe0c8', '#e2d4b4', '#d8c9a4', '#f0e8dc'];
  const blueTones = ['#b8d8f0', '#a8cce8', '#9ec5e6'];
  const orangeTones = ['#f0d4b0', '#e8c498', '#f5c890'];
  const coolTones = ['#c8dce8', '#b8ccd8'];
  const signTones = [b.neon, '#7dd3fc', '#f0abfc'];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const h = hash(b.seed, row, col);
      const roll = h % 100;
      const floorBias = row < 2 ? 18 : row < 5 ? 4 : row < 8 ? -8 : -22;
      if (roll + floorBias > 42) continue;

      const u0 = (col + 0.14) / cols;
      const u1 = (col + 0.86) / cols;
      const v0 = (row + 0.16) / rows;
      const v1 = (row + 0.8) / rows;
      const depth0 = lerp(b.d0, b.d1, u0);
      const depth1 = lerp(b.d0, b.d1, u1);

      const bl = facadePoint(b.side, depth0, v0, b.height);
      const br = facadePoint(b.side, depth1, v0, b.height);
      const tr = facadePoint(b.side, depth1, v1, b.height);
      const tl = facadePoint(b.side, depth0, v1, b.height);

      const gu0 = (col + 0.08) / cols;
      const gu1 = (col + 0.92) / cols;
      const gv0 = (row + 0.1) / rows;
      const gv1 = (row + 0.86) / rows;
      const gd0 = lerp(b.d0, b.d1, gu0);
      const gd1 = lerp(b.d0, b.d1, gu1);

      let color = warmTones[(h >> 3) % warmTones.length];
      const accentRoll = (h >> 4) % 100;
      if (accentRoll < 9) color = blueTones[h % blueTones.length];
      else if (accentRoll < 17) color = orangeTones[h % orangeTones.length];
      else if (h % 19 === 0) color = coolTones[h % coolTones.length];
      else if (h % 37 === 0 && row < 4) color = signTones[h % signTones.length];

      const baseBright =
        row < 2 ? 0.62 + (h % 4) * 0.07 : row < 6 ? 0.38 + (h % 5) * 0.06 : 0.22 + (h % 4) * 0.05;
      const opacity = Math.min(0.92, baseBright * depthFade);

      out.push({
        d: quadPath(
          facadePoint(b.side, gd0, gv0, b.height),
          facadePoint(b.side, gd1, gv0, b.height),
          facadePoint(b.side, gd1, gv1, b.height),
          facadePoint(b.side, gd0, gv1, b.height),
        ),
        color,
        o: opacity * 0.28,
        kind: 'windowGlow',
      });
      out.push({
        d: quadPath(bl, br, tr, tl),
        color,
        o: opacity,
        kind: 'window',
      });
    }
  }

  // Ground-floor shop windows — wider, warmer, brighter
  const shopBands = b.seed % 2 === 0 ? 2 : 1;
  for (let band = 0; band < shopBands; band += 1) {
    const u0 = band === 0 ? 0.06 : 0.52;
    const u1 = band === 0 ? 0.46 : 0.94;
    const v0 = 0.03 + band * 0.07;
    const v1 = v0 + 0.08;
    const d0 = lerp(b.d0, b.d1, u0);
    const d1 = lerp(b.d0, b.d1, u1);
    out.push({
      d: quadPath(
        facadePoint(b.side, d0, v0, b.height),
        facadePoint(b.side, d1, v0, b.height),
        facadePoint(b.side, d1, v1, b.height),
        facadePoint(b.side, d0, v1, b.height),
      ),
      color: band === 0 ? '#fff0d4' : b.seed % 3 === 0 ? '#f5e0c8' : '#ffe8c0',
      o: 0.72 * depthFade,
      kind: 'shop',
    });
  }

  // Occasional vertical neon sign on lower floors
  if (b.seed % 4 === 0) {
    const signCol = (b.seed % 3) + 0.5;
    const su0 = signCol / cols;
    const su1 = (signCol + 0.55) / cols;
    const sv0 = 0.12;
    const sv1 = 0.38;
    const sd0 = lerp(b.d0, b.d1, su0);
    const sd1 = lerp(b.d0, b.d1, su1);
    out.push({
      d: quadPath(
        facadePoint(b.side, sd0, sv0, b.height),
        facadePoint(b.side, sd1, sv0, b.height),
        facadePoint(b.side, sd1, sv1, b.height),
        facadePoint(b.side, sd0, sv1, b.height),
      ),
      color: b.neon,
      o: 0.55 * depthFade,
      kind: 'sign',
    });
  }

  return out;
}

const ALL_WINDOWS = STREET_BUILDINGS.flatMap(buildingLights);

function dashLineToVp(near: Pt, segments = 6): string {
  let d = '';
  for (let i = 0; i < segments; i += 1) {
    if (i % 2 === 1) continue;
    const a = {
      x: lerp(near.x, VP_GROUND.x, i / segments),
      y: lerp(near.y, VP_GROUND.y, i / segments),
    };
    const b = {
      x: lerp(near.x, VP_GROUND.x, (i + 0.55) / segments),
      y: lerp(near.y, VP_GROUND.y, (i + 0.55) / segments),
    };
    d += `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} `;
  }
  return d;
}

/**
 * On the pavement looking up — low horizon, towers lean overhead.
 */
function HeroCityBackdrop() {
  const curbL0 = depthPoint(CURB_L, 0);
  const curbR0 = depthPoint(CURB_R, 0);
  const wallL0 = depthPoint(WALL_L, 0);
  const wallR0 = depthPoint(WALL_R, 0);
  const mid0 = depthPoint(200, 0);

  const streetPoly = `M ${curbL0.x.toFixed(1)} ${curbL0.y.toFixed(1)} L ${curbR0.x.toFixed(1)} ${curbR0.y.toFixed(1)} L ${VP_GROUND.x} ${VP_GROUND.y} Z`;
  const walkL = `M ${wallL0.x.toFixed(1)} ${wallL0.y.toFixed(1)} L ${curbL0.x.toFixed(1)} ${curbL0.y.toFixed(1)} L ${VP_GROUND.x} ${VP_GROUND.y} Z`;
  const walkR = `M ${curbR0.x.toFixed(1)} ${curbR0.y.toFixed(1)} L ${wallR0.x.toFixed(1)} ${wallR0.y.toFixed(1)} L ${VP_GROUND.x} ${VP_GROUND.y} Z`;

  return (
    <View style={styles.cityLayer} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 320"
        preserveAspectRatio="xMidYMid slice"
        style={styles.citySvg}
      >
        <Defs>
          <SvgGradient id="citySky" x1="50%" y1="0%" x2="50%" y2="85%">
            <Stop offset="0%" stopColor="#060814" stopOpacity="1" />
            <Stop offset="55%" stopColor="#0a0e1c" stopOpacity="1" />
            <Stop offset="100%" stopColor="#14101f" stopOpacity="1" />
          </SvgGradient>
          <SvgGradient id="streetWet" x1="50%" y1="100%" x2="50%" y2="0%">
            <Stop offset="0%" stopColor="#1a1430" stopOpacity="1" />
            <Stop offset="55%" stopColor="#15122a" stopOpacity="0.92" />
            <Stop offset="100%" stopColor="#0c0a18" stopOpacity="0.55" />
          </SvgGradient>
          <SvgGradient id="streetGlow" x1="50%" y1="100%" x2="50%" y2="55%">
            <Stop offset="0%" stopColor="#a855f7" stopOpacity="0.5" />
            <Stop offset="50%" stopColor="#22d3ee" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#000" stopOpacity="0" />
          </SvgGradient>
          <SvgGradient id="sidewalk" x1="50%" y1="100%" x2="50%" y2="0%">
            <Stop offset="0%" stopColor="#16141f" stopOpacity="1" />
            <Stop offset="100%" stopColor="#0e0c16" stopOpacity="0.8" />
          </SvgGradient>
          <SvgGradient id="buildingFace" x1="0%" y1="100%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#10131f" stopOpacity="1" />
            <Stop offset="100%" stopColor="#1a1f32" stopOpacity="0.92" />
          </SvgGradient>
          <Filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <FeGaussianBlur stdDeviation="6" />
          </Filter>
          <Filter id="sceneBlur" x="-25%" y="-25%" width="150%" height="150%">
            <FeGaussianBlur stdDeviation="2.8" />
          </Filter>
          <Filter id="windowBlur" x="-80%" y="-80%" width="260%" height="260%">
            <FeGaussianBlur stdDeviation="2.0" />
          </Filter>
          <Filter id="lightGlow" x="-120%" y="-120%" width="340%" height="340%">
            <FeGaussianBlur stdDeviation="2.8" />
          </Filter>
          <RadialGradient id="micClear" cx="50%" cy="40%" rx="24%" ry="34%">
            <Stop offset="0%" stopColor={HERO_NAVY} stopOpacity="0.4" />
            <Stop offset="70%" stopColor={HERO_NAVY} stopOpacity="0.12" />
            <Stop offset="100%" stopColor={HERO_NAVY} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="haze" cx="50%" cy="18%" rx="55%" ry="42%">
            <Stop offset="0%" stopColor="#a855f7" stopOpacity="0.14" />
            <Stop offset="100%" stopColor="#000" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="washL" cx="12%" cy="42%" rx="34%" ry="55%">
            <Stop offset="0%" stopColor="#67e8f9" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="washR" cx="88%" cy="40%" rx="34%" ry="55%">
            <Stop offset="0%" stopColor="#f472b6" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Path d="M 0 0 H 400 V 320 H 0 Z" fill="url(#citySky)" />
        <Path d="M 0 0 H 400 V 320 H 0 Z" fill="url(#haze)" />

        {/* Ground underfoot — low horizon so most of the frame is looking up */}
        <Path d={walkL} fill="url(#sidewalk)" />
        <Path d={walkR} fill="url(#sidewalk)" />
        <Path d={streetPoly} fill="url(#streetWet)" />
        <Path d={streetPoly} fill="url(#streetGlow)" filter="url(#softGlow)" />

        <Path
          d={`M ${curbL0.x.toFixed(1)} ${curbL0.y.toFixed(1)} L ${VP_GROUND.x} ${VP_GROUND.y}`}
          stroke="#67e8f9"
          strokeWidth={1.5}
          opacity={0.5}
          fill="none"
        />
        <Path
          d={`M ${curbR0.x.toFixed(1)} ${curbR0.y.toFixed(1)} L ${VP_GROUND.x} ${VP_GROUND.y}`}
          stroke="#f472b6"
          strokeWidth={1.5}
          opacity={0.5}
          fill="none"
        />
        <Path
          d={dashLineToVp(mid0)}
          stroke="#e2e8f0"
          strokeWidth={1.1}
          opacity={0.3}
          fill="none"
        />

        <Path d="M 0 0 H 400 V 320 H 0 Z" fill="url(#washL)" />
        <Path d="M 0 0 H 400 V 320 H 0 Z" fill="url(#washR)" />

        <G filter="url(#sceneBlur)">
          {STREET_BUILDINGS.map((b, i) => (
            <Path key={`b-${i}`} d={buildingQuad(b)} fill="url(#buildingFace)" opacity={0.9} />
          ))}

          {STREET_BUILDINGS.map((b, i) => {
            const a = facadePoint(b.side, b.d0, 1, b.height);
            const c = facadePoint(b.side, b.d1, 1, b.height);
            const depth = scaleAt((b.d0 + b.d1) / 2);
            return (
              <Path
                key={`n-${i}`}
                d={`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`}
                stroke={b.neon}
                strokeWidth={Math.max(0.5, 1.4 * depth)}
                strokeLinecap="round"
                fill="none"
                opacity={0.32}
              />
            );
          })}

          <G filter="url(#lightGlow)">
            {ALL_WINDOWS.filter((l) => l.kind === 'windowGlow' || l.kind === 'shop').map(
              (l, i) => (
                <Path key={`g-${i}`} d={l.d} fill={l.color} opacity={l.o} />
              ),
            )}
            {ALL_WINDOWS.filter((l) => l.kind === 'sign').map((l, i) => (
              <Path key={`sg-${i}`} d={l.d} fill={l.color} opacity={l.o * 0.45} />
            ))}
          </G>

          <G filter="url(#windowBlur)">
            {ALL_WINDOWS.filter((l) => l.kind === 'window' || l.kind === 'shop').map(
              (l, i) => (
                <Path key={`w-${i}`} d={l.d} fill={l.color} opacity={l.o} />
              ),
            )}
            {ALL_WINDOWS.filter((l) => l.kind === 'sign').map((l, i) => (
              <Path key={`s-${i}`} d={l.d} fill={l.color} opacity={l.o} />
            ))}
          </G>
        </G>

        <Path d="M 0 0 H 400 V 320 H 0 Z" fill="url(#micClear)" />
      </Svg>
    </View>
  );
}

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
  const sharp = Math.sign(s) * Math.pow(Math.abs(Math.min(1, Math.abs(s))), 0.65);
  const localAmp =
    0.4 +
    0.38 * Math.sin(t * Math.PI * 2.15 + phase * 0.55) +
    0.28 * Math.sin(t * Math.PI * 3.7 + phase * 1.15);
  return sharp * Math.max(0.12, localAmp);
}

/**
 * Audio-style waveform along a circular half.
 * Biggest peaks in the middle; amplitude falls off toward the tips.
 * `intensity` 0 = calm arc, 1 = full speaking motion.
 */
function waveTrail(side: -1 | 1, phase: number, intensity = 1, steps = 56): string {
  const start = side < 0 ? 115 : -65;
  const end = side < 0 ? 245 : 65;
  const amp = 18 * Math.max(0, Math.min(1, intensity));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const deg = start + (end - start) * t;
    const rad = (deg * Math.PI) / 180;
    const envelope = Math.pow(Math.sin(t * Math.PI), 2.4);
    const ripple = amp > 0 ? audioSample(t, phase) * amp * envelope : 0;
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
            color: 'transparent',
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
 * Logged-in home hero — voice mic CTA with half-circle gradient waves.
 */
export function HeroMicButton({
  height,
  backgroundColor = HERO_NAVY,
  topInset = 0,
  listening: listeningProp,
  statusMessage,
  onPress,
}: {
  height: number;
  backgroundColor?: string;
  topInset?: number;
  /** When set, parent controls listening (voice search). */
  listening?: boolean;
  /** Shown under the tap hint (e.g. browser not supported). */
  statusMessage?: string | null;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  textColor?: string;
  mutedColor?: string;
  onPress?: () => void;
}) {
  const [phase, setPhase] = useState(0);
  const [internalListening, setInternalListening] = useState(false);
  const isListening = listeningProp ?? internalListening;
  const phaseRef = useRef(0);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isListening) {
      phaseRef.current = 0;
      setPhase(0);
      return;
    }

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
  }, [isListening]);

  useEffect(() => {
    if (!isListening) {
      blinkAnim.stopAnimation();
      blinkAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.15,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isListening, blinkAnim]);

  const handleMicPress = () => {
    if (listeningProp === undefined) {
      setInternalListening((prev) => !prev);
    }
    onPress?.();
  };

  const waveIntensity = isListening ? 1 : 0;
  const trails = useMemo(
    () => ({
      left: waveTrail(-1, phase, waveIntensity),
      right: waveTrail(1, phase + 1.1, waveIntensity),
    }),
    [phase, waveIntensity]
  );

  const micVisual = (
    <View style={styles.micWrap} pointerEvents="none">
      <Svg
        width={RING}
        height={RING}
        viewBox={`0 0 ${RING} ${RING}`}
        style={styles.waveSvg}
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
        <G transform={`translate(${-WAVE_SIDE_OFFSET}, 0)`}>
          <Path
            d={trails.left}
            stroke="url(#arcLeft)"
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.2}
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
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.2}
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

      <Svg
        width={OUTER_GLOW_SIZE}
        height={OUTER_GLOW_SIZE}
        style={styles.orbOuterGlow}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="micBloomOuter" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="#8eb5f5" stopOpacity="0.18" />
            <Stop offset="50%" stopColor="#478beb" stopOpacity="0.1" />
            <Stop offset="100%" stopColor="#478beb" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={OUTER_GLOW_SIZE / 2}
          cy={OUTER_GLOW_SIZE / 2}
          r={OUTER_GLOW_SIZE / 2}
          fill="url(#micBloomOuter)"
        />
      </Svg>

      <Svg
        width={GLOW_SIZE}
        height={GLOW_SIZE}
        style={styles.orbGlow}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="micBloom" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="#b8d4ff" stopOpacity="0.32" />
            <Stop offset="40%" stopColor="#6c9ef5" stopOpacity="0.18" />
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

      <View style={styles.orbShadow}>
        <LinearGradient
          colors={['#67e8f9', '#6c9ef5', '#478beb', '#3a7fe0']}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={styles.orbRing}
        >
          <View style={styles.orb}>
            <Svg
              width={ORB}
              height={ORB}
              viewBox={`0 0 ${ORB} ${ORB}`}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <Defs>
                <RadialGradient id="orbInnerBase" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#060910" />
                  <Stop offset="55%" stopColor="#0a1220" />
                  <Stop offset="82%" stopColor="#12305a" stopOpacity="0.45" />
                  <Stop offset="94%" stopColor="#3a7fe0" stopOpacity="0.32" />
                  <Stop offset="100%" stopColor="#6c9ef5" stopOpacity="0.4" />
                </RadialGradient>
                <RadialGradient id="orbInnerCyan" cx="50%" cy="88%" r="52%">
                  <Stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                  <Stop offset="60%" stopColor="#38bdf8" stopOpacity="0.16" />
                  <Stop offset="100%" stopColor="#67e8f9" stopOpacity="0.24" />
                </RadialGradient>
                <RadialGradient id="orbInnerTop" cx="50%" cy="14%" r="52%">
                  <Stop offset="0%" stopColor="#b8d4ff" stopOpacity="0" />
                  <Stop offset="60%" stopColor="#8eb5f5" stopOpacity="0.14" />
                  <Stop offset="100%" stopColor="#c5dcff" stopOpacity="0.22" />
                </RadialGradient>
              </Defs>
              <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2} fill="url(#orbInnerBase)" />
              <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2} fill="url(#orbInnerCyan)" />
              <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2} fill="url(#orbInnerTop)" />
            </Svg>
            <Ionicons name="mic" size={40} color="#ffffff" style={styles.micIcon} />
          </View>
        </LinearGradient>
      </View>
    </View>
  );

  return (
    <View style={[styles.shell, { height, backgroundColor, paddingTop: topInset }]}>
      <HeroCityBackdrop />

      <LinearGradient
        pointerEvents="none"
        colors={[
          `${backgroundColor}00`,
          `${backgroundColor}55`,
          `${backgroundColor}bb`,
          backgroundColor,
        ]}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.panelFade}
      />

      <View style={styles.content}>
        <View style={styles.headlineRow}>
          <Text style={styles.headline}>Vad vill du göra </Text>
          <GradientText
            style={styles.headline}
            colors={['#c5dcff', '#6c9ef5', '#478beb']}
          >
            idag
          </GradientText>
          <Text style={styles.headline}>?</Text>
        </View>

        <View style={styles.micStage}>
          {Platform.OS === 'web' ? (
            // Native HTML button keeps Chrome's user-gesture for SpeechRecognition.start().
            <button
              type="button"
              aria-label="Prata med TooDoo"
              onClick={handleMicPress}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 4,
              }}
            >
              {micVisual}
            </button>
          ) : (
            <Pressable
              onPress={handleMicPress}
              accessibilityRole="button"
              accessibilityLabel="Prata med TooDoo"
              hitSlop={12}
              style={styles.micPressable}
            >
              {micVisual}
            </Pressable>
          )}
        </View>

        <Text style={styles.talkTitle}>Prata med TooDoo</Text>
        <View style={styles.tapHintRow}>
          <Animated.View
            style={[
              styles.tapDot,
              {
                backgroundColor: isListening ? '#ef4444' : '#374151',
                opacity: isListening ? blinkAnim : 1,
              },
            ]}
          />
          <Text style={styles.tapHint}>
            {isListening ? 'Lyssnar… tappa för att stoppa' : 'Tappa för att prata'}
          </Text>
        </View>
        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}
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
  cityLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#08081a',
  },
  citySvg: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({ filter: 'blur(3.2px)' } as object)
      : {}),
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingBottom: 12,
    zIndex: 3,
  },
  panelFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
    zIndex: 2,
  },
  headlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: 24,
  },
  headline: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  micStage: {
    width: '100%',
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
  },
  micWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveSvg: {
    ...StyleSheet.absoluteFillObject,
  },
  micPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer' } as object)
      : {}),
  },
  orbOuterGlow: {
    position: 'absolute',
    width: OUTER_GLOW_SIZE,
    height: OUTER_GLOW_SIZE,
  },
  orbGlow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  orbShadow: {
    borderRadius: ORB / 2 + 8,
    shadowColor: '#478beb',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow:
            '0 0 16px rgba(108,158,245,0.4), 0 0 32px rgba(71,139,235,0.22)',
        } as object)
      : {}),
  },
  orbRing: {
    padding: 2.5,
    borderRadius: 999,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  micIcon: {
    zIndex: 2,
  },
  talkTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginTop: -6,
  },
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 8,
  },
  tapDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '500',
  },
  statusMessage: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 28,
    lineHeight: 16,
  },
});
