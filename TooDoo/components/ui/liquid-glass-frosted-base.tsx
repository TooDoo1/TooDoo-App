import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  isDark: boolean;
};

/**
 * Frosted blur base — the Liquid Glass approximation used wherever the native iOS 26
 * `GlassView` is unavailable (Expo Go, Android, web, iOS < 26).
 *
 * Real Liquid Glass reads through to the content behind it, so we use the thinnest
 * translucent material (not the opaque `systemChromeMaterial`) plus only a faint wash
 * to keep icons/labels legible without turning the bar milky.
 */
export function LiquidGlassFrostedBase({ isDark }: Props) {
  const tint = isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight';

  return (
    <>
      <BlurView
        tint={tint}
        intensity={Platform.OS === 'android' ? 72 : 48}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        blurReductionFactor={Platform.OS === 'android' ? 2.5 : 4}
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
