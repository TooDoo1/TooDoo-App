import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

const SUPPORT_EMAIL = 'info@toodoo.se';

export default function ProfileSupportScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const openEmail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('TooDoo – Kundsupport')}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Kunde inte öppna e-post', SUPPORT_EMAIL);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Kunde inte öppna e-post', SUPPORT_EMAIL);
    }
  };

  return (
    <ProfileScreenShell
      title="Kundsupport"
      subtitle="Vi hjälper dig gärna."
    >
      <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
        <Text className="text-sm leading-6" style={{ color: theme.textMuted }}>
          Har du frågor om erbjudanden, ditt konto eller tekniska problem? Hör av dig så återkommer vi så
          snart vi kan.
        </Text>

        <Text className="mt-5 text-sm" style={{ color: theme.textFaint }}>
          E-post
        </Text>
        <Pressable onPress={() => void openEmail()}>
          <Text className="mt-1 text-base font-medium" style={{ color: theme.link }}>
            {SUPPORT_EMAIL}
          </Text>
        </Pressable>

        <Text className="mt-5 text-sm" style={{ color: theme.textFaint }}>
          Vanliga ärenden
        </Text>
        <Text className="mt-2 text-sm leading-6" style={{ color: theme.textMuted }}>
          • Problem med att claima eller lösa in erbjudanden{'\n'}
          • Uppdatering av kontouppgifter{'\n'}
          • Företag och samarbeten
        </Text>

        <Pressable
          className="mt-6 rounded-2xl px-4 py-3"
          onPress={() => void openEmail()}
          style={{ backgroundColor: OFFERS_CATEGORY_ACCENT }}
        >
          <Text className="text-center font-medium text-white">Kontakta support</Text>
        </Pressable>
      </View>
    </ProfileScreenShell>
  );
}
