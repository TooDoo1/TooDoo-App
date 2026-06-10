import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandColors } from '@/lib/brand-colors';

type StarryVariant = 'dark' | 'light';

export function StarrySkyScreenBackground({
  variant = 'dark',
  gradientColors,
}: {
  variant?: StarryVariant;
  gradientColors?: string[];
}) {
  const resolvedGradientColors =
    gradientColors ??
    (variant === 'light'
      ? ['#fbfaf9', '#f3f1ef', '#fbfaf9']
      : [BrandColors.dark.background, BrandColors.dark.secondary, BrandColors.dark.background]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={resolvedGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
