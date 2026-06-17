import { StyleSheet, View } from 'react-native';

import { LiquidGlassFrostedBase } from '@/components/ui/liquid-glass-frosted-base';
import { LiquidGlassSpecularOverlay } from '@/components/ui/liquid-glass-specular-overlay';

type Props = {
  isDark: boolean;
  borderRadius: number;
};

/** @deprecated Use LiquidGlassTabBarShell — kept for any legacy imports. */
export function LiquidGlassTabBarBackground({ isDark, borderRadius }: Props) {
  return (
    <View style={[styles.shell, { borderRadius }]}>
      <LiquidGlassFrostedBase isDark={isDark} />
      <LiquidGlassSpecularOverlay isDark={isDark} borderRadius={borderRadius} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
