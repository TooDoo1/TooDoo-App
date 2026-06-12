import { Text, View } from 'react-native';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export default function ProfilePolicyScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  return (
    <ProfileScreenShell
      title="Policy"
      subtitle="Användarvillkor och integritet."
    >
      <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
        <Text className="text-base font-semibold" style={{ color: theme.text }}>
          Användarvillkor
        </Text>
        <Text className="mt-2 text-sm leading-6" style={{ color: theme.textMuted }}>
          TooDoo hjälper dig att hitta och claima lokala erbjudanden. Genom att använda appen godkänner du att
          följa våra regler, inte missbruka tjänsten och ge korrekta uppgifter vid registrering.
        </Text>

        <Text className="mt-5 text-base font-semibold" style={{ color: theme.text }}>
          Integritetspolicy
        </Text>
        <Text className="mt-2 text-sm leading-6" style={{ color: theme.textMuted }}>
          Vi behandlar dina personuppgifter för att tillhandahålla konto, erbjudanden och support. Plats används
          för att visa relevanta företag nära dig när du gett tillåtelse. Du kan när som helst uppdatera dina
          uppgifter under Konto eller kontakta oss om du har frågor om dina data.
        </Text>

        <Text className="mt-5 text-base font-semibold" style={{ color: theme.text }}>
          Erbjudanden och QR-koder
        </Text>
        <Text className="mt-2 text-sm leading-6" style={{ color: theme.textMuted }}>
          Claimade erbjudanden är personliga och kan ha tidsbegränsningar. Butiken validerar QR-koden vid
          inlösen enligt erbjudandets villkor.
        </Text>
      </View>
    </ProfileScreenShell>
  );
}
