import { Text, View } from 'react-native';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export default function ErbjudandenScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.screenBg }}>
      <Text style={{ color: theme.textMuted }}>Välj ett kort från startsidan för att se detaljer här.</Text>
    </View>
  );
}
