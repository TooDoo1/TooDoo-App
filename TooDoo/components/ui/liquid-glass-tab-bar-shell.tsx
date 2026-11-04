import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

import { LiquidGlassFrostedBase } from '@/components/ui/liquid-glass-frosted-base';

type Props = {
  isDark: boolean;
  borderRadius: number;
  /** Soft top corners for a docked bottom bar (radius on bottom stays 0). */
  topRadius?: number;
  width: number;
  height: number;
  children: ReactNode;
  /** Flush to screen bottom — top hairline instead of full pill border. */
  docked?: boolean;
};

export function useNativeTabBarLiquidGlass() {
  return Platform.OS === 'ios' && isGlassEffectAPIAvailable();
}

/**
 * Tab bar shell — on iOS 26+ the GlassView wraps tab children (like system controls).
 * Transform/opacity on parents breaks native glass; the overlay animates `bottom` instead.
 */
export function LiquidGlassTabBarShell({
  isDark,
  borderRadius,
  topRadius,
  width,
  height,
  children,
  docked = false,
}: Props) {
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(19, 23, 32, 0.08)';
  const radiusTop = topRadius ?? borderRadius;
  const radiusStyle = docked
    ? {
        borderTopLeftRadius: radiusTop,
        borderTopRightRadius: radiusTop,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }
    : { borderRadius };

  const body = <View style={styles.content}>{children}</View>;

  if (useNativeTabBarLiquidGlass()) {
    return (
      <GlassView
        style={[
          styles.shell,
          {
            width,
            height,
            ...radiusStyle,
          },
        ]}
        glassEffectStyle="regular"
        isInteractive
      >
        {body}
      </GlassView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.shell,
          {
            width,
            height,
            ...radiusStyle,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor,
            backgroundColor: isDark ? 'rgba(14, 19, 37, 0.92)' : 'rgba(255, 255, 255, 0.94)',
            // @ts-expect-error web-only CSS
            backdropFilter: 'blur(22px) saturate(1.3)',
            // @ts-expect-error web-only CSS
            WebkitBackdropFilter: 'blur(22px) saturate(1.3)',
          },
        ]}
      >
        {body}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.shell,
        {
          width,
          height,
          ...radiusStyle,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor,
        },
      ]}
    >
      <LiquidGlassFrostedBase isDark={isDark} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
});
