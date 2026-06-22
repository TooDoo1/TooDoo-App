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
    // Apple HIG: the `regular` variant is correct for tab bars / navigation chrome —
    // it is fully adaptive and stays legible over any content. `isInteractive` makes
    // the glass react to touches. Never apply opacity to this view or any ancestor
    // (it breaks the native effect); the overlay animates `bottom`, not opacity.
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
