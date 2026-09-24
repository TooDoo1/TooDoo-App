import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandColors } from '@/lib/brand-colors';

const SIZE = 44;
const RECORDING_RED = '#ff3b30';

type InlineMicButtonProps = {
  listening: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  style?: object;
};

export function InlineMicButton({
  listening,
  onPress,
  accessibilityLabel,
  style,
}: InlineMicButtonProps) {
  const pulseA = useRef(new Animated.Value(0)).current;
  const pulseB = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulseA.stopAnimation();
      pulseB.stopAnimation();
      pulseA.setValue(0);
      pulseB.setValue(0);
      return;
    }

    const makePulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const a = makePulse(pulseA, 0);
    const b = makePulse(pulseB, 700);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [listening, pulseA, pulseB]);

  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.2, 1],
      outputRange: [0.55, 0.35, 0],
    }),
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.85],
        }),
      },
    ],
  });

  const scale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: listening }}
      onPress={onPress}
      onPressIn={() => {
        Animated.spring(press, {
          toValue: 1,
          useNativeDriver: true,
          speed: 40,
          bounciness: 4,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(press, {
          toValue: 0,
          useNativeDriver: true,
          speed: 40,
          bounciness: 6,
        }).start();
      }}
      style={[styles.hit, style]}
    >
      <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
        {listening ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[styles.ring, { borderColor: RECORDING_RED }, ringStyle(pulseA)]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.ring, { borderColor: RECORDING_RED }, ringStyle(pulseB)]}
            />
            <View style={[styles.orb, styles.orbRecording]}>
              <Ionicons name="mic" size={20} color="#ffffff" />
            </View>
          </>
        ) : (
          <LinearGradient
            colors={[BrandColors.dark.primarySoft, BrandColors.dark.primary, BrandColors.dark.accent]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.orb}
          >
            <View style={styles.orbSheen} />
            <Ionicons name="mic-outline" size={20} color="#ffffff" />
          </LinearGradient>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: SIZE,
    height: SIZE,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbRecording: {
    backgroundColor: RECORDING_RED,
  },
  orbSheen: {
    position: 'absolute',
    top: 3,
    left: 6,
    right: 6,
    height: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
});
