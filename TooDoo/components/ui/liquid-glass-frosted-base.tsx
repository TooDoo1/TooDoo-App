import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  isDark: boolean;
};

/**
 * Frosted blur base — the Liquid Glass approximation used wherever the native iOS 26
 * `GlassView` is unavailable (Expo Go, Android, web, iOS < 26).
 *
 * On Android we skip live BlurView (dimezisBlurView) — it re-samples the screen every
 * frame and makes scrolling / the tab bar feel laggy. A near-opaque tint is enough.
 */
export function LiquidGlassFrostedBase({ isDark }: Props) {
  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(14, 19, 37, 0.94)' : 'rgba(255, 255, 255, 0.94)',
          },
        ]}
      />
    );
  }

  const tint = isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight';

  return (
    <>
      <BlurView
        tint={tint}
        intensity={48}
        blurReductionFactor={4}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
      />
    </>
  );
}
