import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  isDark: boolean;
  borderRadius: number;
};

/** Specular edge highlights that sell the liquid-glass look on non-native fallbacks. */
export function LiquidGlassSpecularOverlay({ isDark, borderRadius }: Props) {
  return (
    <>
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']
        }
        locations={[0, 0.14, 0.42]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', isDark ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.05)']}
        locations={[0.72, 1]}
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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.45)',
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.innerRim,
          {
            borderRadius: Math.max(borderRadius - 1, 0),
            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.2)',
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  innerRim: {
    ...StyleSheet.absoluteFillObject,
    margin: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
