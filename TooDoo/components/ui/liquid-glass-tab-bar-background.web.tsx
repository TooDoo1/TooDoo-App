import { StyleSheet, View } from 'react-native';

import { LiquidGlassSpecularOverlay } from '@/components/ui/liquid-glass-specular-overlay';

type Props = {
  isDark: boolean;
  borderRadius: number;
};

/** Web liquid-glass simulation via backdrop-filter + specular layers. */
export function LiquidGlassTabBarBackground({ isDark, borderRadius }: Props) {
  return (
    <View style={[styles.shell, { borderRadius }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.blurLayer,
          isDark ? styles.blurLayerDark : styles.blurLayerLight,
        ]}
      />
      <LiquidGlassSpecularOverlay isDark={isDark} borderRadius={borderRadius} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blurLayer: {
    // @ts-expect-error web-only CSS
    backdropFilter: 'blur(22px) saturate(165%)',
    // @ts-expect-error web-only CSS
    WebkitBackdropFilter: 'blur(22px) saturate(165%)',
  },
  blurLayerDark: {
    backgroundColor: 'rgba(14, 19, 37, 0.52)',
  },
  blurLayerLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
