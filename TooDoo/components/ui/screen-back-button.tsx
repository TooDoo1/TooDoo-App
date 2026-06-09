import { Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export function ScreenBackButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tillbaka"
      onPress={() => {
        if (Platform.OS === 'web' && router.canDismiss()) {
          router.dismiss();
          return;
        }
        router.back();
      }}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        zIndex: 30,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.82)',
      }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.text} />
    </Pressable>
  );
}
