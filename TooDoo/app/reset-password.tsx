import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { PasswordInput } from '@/components/ui/password-input';
import { useThemePreference } from '@/context/theme-preference-context';
import { resetPasswordWithToken } from '@/lib/forgot-password-api';
import { uiTheme } from '@/lib/ui-theme';

function readParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[]; token?: string | string[] }>();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const tokenFromLink = useMemo(() => readParam(params.token), [params.token]);
  const emailFromLink = useMemo(() => readParam(params.email), [params.email]);

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedToken = tokenFromLink.trim();

    if (!trimmedEmail || !trimmedToken) {
      Alert.alert('Ogiltig länk', 'Återställningslänken saknar e-post eller token. Begär en ny länk.');
      return;
    }

    if (!password || !confirmPassword) {
      Alert.alert('Saknad information', 'Fyll i ditt nya lösenord.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Ogiltigt lösenord', 'Lösenord måste vara minst 8 tecken.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Lösenorden matchar inte', 'Bekräfta ditt nya lösenord.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { response, data } = await resetPasswordWithToken({
        email: trimmedEmail,
        token: trimmedToken,
        password,
      });

      if (response.status === 401) {
        Alert.alert('Ogiltig länk', 'Länken har gått ut eller matchar inte e-postadressen.');
        return;
      }

      if (response.status === 404) {
        Alert.alert('Hittades inte', 'Ingen användare med den e-postadressen.');
        return;
      }

      if (!response.ok) {
        Alert.alert('Fel', data.error ?? 'Kunde inte återställa lösenordet.');
        return;
      }

      Alert.alert('Klart', data.message ?? 'Lösenordet har uppdaterats.', [
        { text: 'Logga in', onPress: () => router.replace('/(tabs)/Loggain') },
      ]);
    } catch {
      Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!tokenFromLink) {
    return (
      <ProfileScreenShell title="Återställ lösenord" subtitle="Länken verkar vara ogiltig.">
        <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
          <Text className="text-sm leading-6" style={{ color: theme.textMuted }}>
            Öppna länken från e-postmeddelandet eller begär en ny återställningslänk från inloggningen.
          </Text>
          <Pressable
            className="mt-6 rounded-2xl px-4 py-3"
            style={{ backgroundColor: '#ff3b30' }}
            onPress={() => router.replace('/glomt-losenord')}
          >
            <Text className="text-center font-medium text-white">Begär ny länk</Text>
          </Pressable>
        </View>
      </ProfileScreenShell>
    );
  }

  return (
    <ProfileScreenShell title="Nytt lösenord" subtitle="Välj ett nytt lösenord för ditt konto.">
      <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
        <Text className="text-sm" style={{ color: theme.textFaint }}>
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

        <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
          Nytt lösenord
        </Text>
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="Minst 8 tecken"
          placeholderTextColor={theme.textFaint}
          wrapperStyle={{
            borderColor: theme.border,
            backgroundColor: theme.cardBgMuted,
          }}
          style={{ color: theme.text }}
          toggleColor={theme.textMuted}
        />

        <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
          Bekräfta lösenord
        </Text>
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Upprepa lösenord"
          placeholderTextColor={theme.textFaint}
          wrapperStyle={{
            borderColor: theme.border,
            backgroundColor: theme.cardBgMuted,
          }}
          style={{ color: theme.text }}
          toggleColor={theme.textMuted}
        />

        <Pressable
          className="mt-6 rounded-2xl px-4 py-3"
          style={{ backgroundColor: isSubmitting ? 'rgba(255, 59, 48, 0.45)' : '#ff3b30' }}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          <Text className="text-center font-medium text-white">
            {isSubmitting ? 'Sparar...' : 'Spara nytt lösenord'}
          </Text>
        </Pressable>
      </View>
    </ProfileScreenShell>
  );
}
