import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { uiTheme } from '@/lib/ui-theme';

export default function ProfileSecurityScreen() {
  const { authFetch } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Saknad information', 'Fyll i alla fält.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Ogiltigt lösenord', 'Nytt lösenord måste vara minst 8 tecken.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Lösenorden matchar inte', 'Bekräfta ditt nya lösenord.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await authFetch('/user/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          typeof json?.error === 'string'
            ? json.error
            : typeof json?.message === 'string'
              ? json.message
              : 'Kunde inte byta lösenord.';
        Alert.alert('Kunde inte spara', message);
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Sparat', 'Ditt lösenord har uppdaterats.');
    } catch {
      Alert.alert('Kunde inte spara', 'Lösenordet kunde inte uppdateras just nu.');
    } finally {
      setIsSaving(false);
    }
  };

  const fieldStyle = {
    borderColor: theme.border,
    backgroundColor: theme.cardBgMuted,
    color: theme.text,
  };

  return (
    <ProfileScreenShell
      title="Säkerhet"
      subtitle="Byt lösenord för ditt konto."
    >
      <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
        <Text className="text-sm" style={{ color: theme.textFaint }}>
          Nuvarande lösenord
        </Text>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Nuvarande lösenord"
          placeholderTextColor={theme.textFaint}
          className="mt-1 rounded-2xl border px-4 py-3"
          style={fieldStyle}
        />

        <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
          Nytt lösenord
        </Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Minst 8 tecken"
          placeholderTextColor={theme.textFaint}
          className="mt-1 rounded-2xl border px-4 py-3"
          style={fieldStyle}
        />

        <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
          Bekräfta nytt lösenord
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Upprepa nytt lösenord"
          placeholderTextColor={theme.textFaint}
          className="mt-1 rounded-2xl border px-4 py-3"
          style={fieldStyle}
        />

        <Pressable
          className="mt-6 rounded-2xl px-4 py-3"
          onPress={() => void handleSave()}
          disabled={isSaving}
          style={{
            backgroundColor: isSaving ? 'rgba(255, 59, 48, 0.45)' : OFFERS_CATEGORY_ACCENT,
          }}
        >
          <Text className="text-center font-medium text-white">
            {isSaving ? 'Sparar...' : 'Uppdatera lösenord'}
          </Text>
        </Pressable>
      </View>
    </ProfileScreenShell>
  );
}
