import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

type Star = {
  id: string;
  x: number; // 0..1
  y: number; // 0..1
  size: number;
  color: string;
  baseOpacity: number;
  twinkleMs: number;
};

type StarryVariant = 'dark' | 'light';

const buildSparklePath = (size: number) => {
  const outer = size / 2;
  const inner = size / 7;
  return `M 0,-${outer} L ${inner},-${inner} L ${outer},0 L ${inner},${inner} L 0,${outer} L -${inner},${inner} L -${outer},0 L -${inner},-${inner} Z`;
};

export function StarryBackground({ starCount = 80, variant = 'dark' }: { starCount?: number; variant?: StarryVariant }) {
  const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const stars = useMemo<Star[]>(() => {
    const lightPink = 'rgba(235, 187, 208, 0.9)'; // lighter matte pink
    const lightGreen = 'rgba(186, 219, 194, 0.9)'; // lighter matte green
    // Global accent remap: always use pink + green stars for both modes.
    const primary = lightPink;
    const secondary = lightGreen;
    return Array.from({ length: starCount }, (_, i) => {
      const pickSecondary = i % 3 === 0;
      return {
        id: `star-${i}`,
        x: Math.random(),
        y: Math.random(),
        size: 4 + Math.random() * 6,
        color: pickSecondary ? secondary : primary,
        baseOpacity: 0.12 + Math.random() * 0.25,
        twinkleMs: 1200 + Math.floor(Math.random() * 2200),
      };
    });
  }, [starCount, variant]);

  const opacities = useRef(stars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!layout.width || !layout.height) return;

    const animations = opacities.map((value, idx) => {
      const star = stars[idx];
      value.setValue(star.baseOpacity);
      const peak = Math.min(1, star.baseOpacity + 0.55);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: peak, duration: star.twinkleMs, useNativeDriver: true }),
          Animated.timing(value, { toValue: star.baseOpacity, duration: star.twinkleMs, useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    });

    return () => {
      animations.forEach((anim) => anim.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height, stars.length]);

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!width || !height) return;
        setLayout({ width, height });
      }}
      style={{ ...StyleSheet.absoluteFillObject }}
    >
      {layout.width && layout.height
        ? stars.map((star, idx) => (
            <Animated.View
              key={star.id}
              style={{
                position: 'absolute',
                left: Math.round(star.x * layout.width),
                top: Math.round(star.y * layout.height),
                opacity: opacities[idx],
              }}
            >
              <View
                style={{
                  width: star.size,
                  height: star.size,
                  transform: [{ rotate: `${(idx % 8) * 15}deg` }],
                }}
              >
                <Svg width={star.size} height={star.size} viewBox={`-${star.size / 2} -${star.size / 2} ${star.size} ${star.size}`}>
                  <Path d={buildSparklePath(star.size)} fill={star.color} />
                </Svg>
              </View>
            </Animated.View>
          ))
        : null}
    </View>
  );
}

export function StarrySkyScreenBackground({ variant = 'dark' }: { variant?: StarryVariant }) {
  const gradientColors =
    variant === 'light'
      ? ['#f9fbff', '#eef4ff', '#f7faff']
      : ['#000b2a', '#061a47', '#000b2a'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StarryBackground starCount={80} variant={variant} />
    </View>
  );
}

