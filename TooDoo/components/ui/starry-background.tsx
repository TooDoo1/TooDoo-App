import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type StarryVariant = 'dark' | 'light';

export function StarrySkyScreenBackground({ variant = 'dark' }: { variant?: StarryVariant }) {
  const gradientColors =
    variant === 'light'
      ? ['#f9fbff', '#eef4ff', '#f7faff']
      : ['#000b2a', '#061a47', '#000b2a'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
