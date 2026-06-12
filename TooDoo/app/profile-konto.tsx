import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  getCategoryAccentColor,
  getOnAccentTextColor,
  OFFERS_CATEGORY_ACCENT,
} from '@/lib/category-colors';
import {
  fetchCategoryOptions,
  GENDER_OPTIONS,
  normalizeInterestIds,
  type CategoryOption,
  type UserGender,
  type UserProfile,
} from '@/lib/profile';
import { uiTheme } from '@/lib/ui-theme';

export default function ProfileKontoScreen() {
  const { authFetch } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<UserGender>('OTHER');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const [profileRes, categories] = await Promise.all([
        authFetch('/user/me'),
        fetchCategoryOptions(),
      ]);
      const json = (await profileRes.json().catch(() => ({}))) as UserProfile;
      setProfile(json);
      setFirstName(json.firstName ?? '');
      setLastName(json.lastName ?? '');
      setGender((json.gender as UserGender) ?? 'OTHER');
      setSelectedCategoryIds(normalizeInterestIds(json.interests));
      setCategoryOptions(categories);
    } catch {
      Alert.alert('Kunde inte ladda', 'Kontouppgifterna kunde inte hämtas just nu.');
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (categoryOptions.length > 0) return;

    let cancelled = false;
    setIsLoadingCategories(true);
    void (async () => {
      try {
        const categories = await fetchCategoryOptions();
        if (!cancelled) setCategoryOptions(categories);
      } finally {
        if (!cancelled) setIsLoadingCategories(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryOptions.length]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch('/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          gender,
          interests: selectedCategoryIds,
        }),
      });

      if (!res.ok) {
        throw new Error('save failed');
      }

      const updated = (await res.json().catch(() => ({}))) as UserProfile;
      setProfile((prev) => ({ ...(prev ?? {}), ...updated }));
      Alert.alert('Sparat', 'Dina kontouppgifter har uppdaterats.');
    } catch {
      Alert.alert('Kunde inte spara', 'Uppgifterna kunde inte sparas just nu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ProfileScreenShell
      title="Konto"
      subtitle="Uppdatera namn, kön och intressen."
    >
      {isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <View className="rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
          <Text className="text-sm" style={{ color: theme.textFaint }}>
            E-post
          </Text>
          <Text className="mt-1" style={{ color: theme.text }}>
            {profile?.email ?? '-'}
          </Text>

          <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
            Förnamn
          </Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Förnamn"
            placeholderTextColor={theme.textFaint}
            className="mt-1 rounded-2xl border px-4 py-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
          />

          <Text className="mt-3 text-sm" style={{ color: theme.textFaint }}>
            Efternamn
          </Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Efternamn"
            placeholderTextColor={theme.textFaint}
            className="mt-1 rounded-2xl border px-4 py-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
          />

          <Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>
            Kön
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => {
              const active = gender === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setGender(option.value)}
                  className="rounded-2xl px-4 py-2.5"
                  style={{
                    backgroundColor: active ? OFFERS_CATEGORY_ACCENT : theme.cardBgMuted,
                    borderWidth: active ? 0 : 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text className="font-medium" style={{ color: active ? '#ffffff' : theme.text }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mt-5 text-sm" style={{ color: theme.textFaint }}>
            Intressen
          </Text>
          <Text className="mt-1 text-xs" style={{ color: theme.textMuted }}>
            Välj kategorier du vill se mer av.
          </Text>

          {isLoadingCategories ? (
            <Text className="mt-3" style={{ color: theme.textMuted }}>
              Laddar kategorier...
            </Text>
          ) : (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {categoryOptions.map((option) => {
                const isSelected = selectedCategoryIds.includes(option.id);
                const accent = getCategoryAccentColor(option.name);
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setSelectedCategoryIds((prev) =>
                        prev.includes(option.id)
                          ? prev.filter((id) => id !== option.id)
                          : [...prev, option.id]
                      );
                    }}
                    className="rounded-2xl border px-4 py-2.5"
                    style={{
                      backgroundColor: isSelected ? accent : theme.cardBgMuted,
                      borderColor: isSelected ? accent : theme.border,
                    }}
                  >
                    <Text
                      className="font-medium"
                      style={{ color: isSelected ? getOnAccentTextColor(accent) : theme.text }}
                    >
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            className="mt-6 rounded-2xl px-4 py-3"
            onPress={() => void handleSave()}
            disabled={isSaving}
            style={{
              backgroundColor: isSaving ? 'rgba(255, 59, 48, 0.45)' : OFFERS_CATEGORY_ACCENT,
            }}
          >
            <Text className="text-center font-medium text-white">
              {isSaving ? 'Sparar...' : 'Spara ändringar'}
            </Text>
          </Pressable>
        </View>
      )}
    </ProfileScreenShell>
  );
}
