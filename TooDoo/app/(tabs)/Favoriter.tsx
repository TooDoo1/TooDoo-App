import { ScrollView, Text, View } from 'react-native';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export default function FavoriterScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-2xl font-semibold" style={{ color: theme.text }}>Favoriter</Text>
        <Text className="mt-2" style={{ color: theme.textMuted }}>
          Dina sparade favoriter visas har.
        </Text>
      </ScrollView>
    </View>
  );
}
