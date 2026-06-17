import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

import { LiquidGlassFrostedBase } from '@/components/ui/liquid-glass-frosted-base';
import { LiquidGlassSpecularOverlay } from '@/components/ui/liquid-glass-specular-overlay';

type Props = {
  isDark: boolean;
  borderRadius: number;
  width: number;
  height: number;
  children: ReactNode;
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
  width,
  height,
  children,
}: Props) {
  if (useNativeTabBarLiquidGlass()) {
    return (
      <GlassView
        style={[
          styles.shell,
          {
            width,
            height,
            borderRadius,
          },
        ]}
        glassEffectStyle="regular"
        isInteractive
        colorScheme={isDark ? 'dark' : 'light'}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[styles.shell, { width, height, borderRadius }]}>
      <LiquidGlassFrostedBase isDark={isDark} />
      <LiquidGlassSpecularOverlay isDark={isDark} borderRadius={borderRadius} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
