import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  isDark: boolean;
  borderRadius: number;
};

export function LiquidGlassTabBarBackground({ isDark, borderRadius }: Props) {
  const blurIntensity = Platform.OS === 'android' ? 40 : 48;

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={blurIntensity}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
      />
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
        }
        locations={[0, 0.22, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.35)',
          },
        ]}
      />
    </View>
  );
}
