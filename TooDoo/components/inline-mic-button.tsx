import { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BrandColors, FilterChipTheme } from '@/lib/brand-colors';

const ORB_SIZE = 44;
const ORB_CORNER = 14;
const FIELD_SIZE = 34;
const RECORDING_RED = '#ff3b30';

type InlineMicButtonProps = {
  listening: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  style?: object;
  /** `orb` = solid outside button; `field` = compact trailing control inside the search bar. */
  variant?: 'orb' | 'field';
};

export function InlineMicButton({
  listening,
  onPress,
  accessibilityLabel,
  style,
  variant = 'orb',
}: InlineMicButtonProps) {
  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.94],
  });
  const isField = variant === 'field';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: listening }}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress();
      }}
      onPressIn={() => {
        Animated.timing(press, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.timing(press, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }).start();
      }}
      hitSlop={isField ? 6 : undefined}
      style={[isField ? styles.fieldHit : styles.orbHit, style]}
    >
      <Animated.View
        style={[
          isField ? styles.fieldOrb : styles.orb,
          {
            backgroundColor: listening
              ? RECORDING_RED
              : isField
                ? 'transparent'
                : BrandColors.dark.primary,
            transform: [{ scale }],
          },
        ]}
      >
        <Ionicons
          name={listening ? 'stop' : 'mic'}
          size={isField ? 20 : 22}
          color={
            listening
              ? '#ffffff'
              : isField
                ? FilterChipTheme.textMuted
                : '#ffffff'
          }
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orbHit: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_CORNER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldHit: {
    width: FIELD_SIZE,
    height: FIELD_SIZE,
    marginLeft: 4,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldOrb: {
    width: FIELD_SIZE,
    height: FIELD_SIZE,
    borderRadius: FIELD_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
