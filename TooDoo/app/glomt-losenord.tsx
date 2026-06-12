import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  getPasswordResetRequestErrorMessage,
  requestPasswordResetEmail,
} from '@/lib/forgot-password-api';
import { uiTheme } from '@/lib/ui-theme';

export default function GlomtLosenordScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const initialEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam ?? '';
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Saknad information', 'Ange din e-postadress.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { response, data } = await requestPasswordResetEmail(trimmed);

      if (!response.ok) {
        Alert.alert('Kunde inte skicka länk', getPasswordResetRequestErrorMessage(response.status, data));
        return;
      }

      if (data.emailSent === false) {
        Alert.alert(
          'E-post kunde inte skickas',
          data.emailErrorDetail ??
            'Återställningslänken kunde inte skickas just nu. Försök igen senare eller kontakta support.'
        );
        return;
      }

      Alert.alert(
        'Kolla din inkorg',
        'Om kontot finns har vi skickat en länk för att återställa ditt lösenord.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/Loggain') }]
      );
    } catch {
      Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProfileScreenShell
      title="Glömt lösenord"
      subtitle="Vi skickar en länk för att välja ett nytt lösenord."
    >
      <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
        <Text className="text-sm leading-6" style={{ color: theme.textMuted }}>
          Ange e-postadressen för ditt konto. Du får en länk som är giltig i en timme.
        </Text>

        <Text className="mt-5 text-sm" style={{ color: theme.textFaint }}>
          E-post
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Din e-postadress"
          placeholderTextColor={theme.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          className="mt-2 rounded-2xl border px-4 py-3"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.cardBgMuted,
            color: theme.text,
          }}
        />

        <Pressable
          className="mt-6 rounded-2xl px-4 py-3"
          style={{ backgroundColor: isSubmitting ? 'rgba(255, 59, 48, 0.45)' : '#ff3b30' }}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          <Text className="text-center font-medium text-white">
            {isSubmitting ? 'Skickar...' : 'Skicka återställningslänk'}
          </Text>
        </Pressable>
      </View>
    </ProfileScreenShell>
  );
}
