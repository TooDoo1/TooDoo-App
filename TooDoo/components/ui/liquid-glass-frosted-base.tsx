import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  isDark: boolean;
};

/** Frosted blur base — used where native Liquid Glass is unavailable. */
export function LiquidGlassFrostedBase({ isDark }: Props) {
  const tint = isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight';

  return (
    <>
      <BlurView
        tint={tint}
        intensity={Platform.OS === 'android' ? 80 : 64}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        blurReductionFactor={Platform.OS === 'android' ? 2.5 : 4}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.14)',
          },
        ]}
      />
    </>
  );
}
