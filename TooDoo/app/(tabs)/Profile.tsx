import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { ProfileMenuRow } from '@/components/profile/profile-menu-row';
import { profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { getProfileDisplayName, type UserProfile } from '@/lib/profile';
import { uiTheme } from '@/lib/ui-theme';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, token, authFetch } = useAuth();
  const { mode, setMode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);
  const isLightMode = mode === 'light';
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom, undefined, 32);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authFetch('/user/me');
      const json = (await res.json().catch(() => ({}))) as UserProfile;
      setProfile(json);
      if (typeof json.notificationsEnabled === 'boolean') {
        setNotificationsEnabled(json.notificationsEnabled);
      }
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleToggleNotifications = async (next: boolean) => {
    const previous = notificationsEnabled;
    setNotificationsEnabled(next);
    if (!token) return;

    try {
      const res = await authFetch('/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationsEnabled: next }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setNotificationsEnabled(previous);
    }
  };

  const displayName = getProfileDisplayName(profile);

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.screenBg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
    >
      <View className="min-h-full px-6 pt-24">
        <Text className="text-center text-3xl font-semibold" style={{ color: theme.text }}>
          Profil
        </Text>

        {isLoading ? (
          <View className="mt-8 items-center">
            <ActivityIndicator color={theme.text} />
            <Text className="mt-3" style={{ color: theme.textMuted }}>
              Laddar profil...
            </Text>
          </View>
        ) : (
          <>
            <View
              className="mt-8 rounded-2xl px-4 py-5"
              style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
            >
              <Text className="text-lg font-semibold" style={{ color: theme.text }}>
                {displayName}
              </Text>
              {profile?.email ? (
                <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
                  {profile.email}
                </Text>
              ) : null}
            </View>

            <View
              className="mt-4 overflow-hidden rounded-2xl"
              style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
            >
              <ProfileMenuRow
                label="Konto"
                description="Namn, kön och intressen"
                icon="person-outline"
                onPress={() => router.push('/profile-konto')}
              />
              <ProfileMenuRow
                label="Säkerhet"
                description="Byt lösenord"
                icon="lock-closed-outline"
                onPress={() => router.push('/profile-security')}
              />
              <ProfileMenuRow
                label="Policy"
                description="Villkor och integritet"
                icon="document-text-outline"
                onPress={() => router.push('/profile-policy')}
              />
              <ProfileMenuRow
                label="Kundsupport"
                description="Kontakta oss"
                icon="chatbubble-ellipses-outline"
                onPress={() => router.push('/profile-support')}
                isLast
              />
            </View>

            <View
              className="mt-4 rounded-2xl px-4 py-5"
              style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-lg font-semibold" style={{ color: theme.text }}>
                    Notiser
                  </Text>
                  <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
                    Påminnelser om nya erbjudanden och deals som snart går ut.
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: '#3a3a3c', true: '#34c759' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View
              className="mt-4 rounded-2xl px-4 py-5"
              style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-lg font-semibold" style={{ color: theme.text }}>
                    Ljust läge
                  </Text>
                  <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
                    Växla mellan mörkt och ljust tema.
                  </Text>
                </View>
                <Switch
                  value={isLightMode}
                  onValueChange={(next) => setMode(next ? 'light' : 'dark')}
                  trackColor={{ false: '#3a3a3c', true: theme.accentGreen }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View
              className="mt-4 rounded-2xl px-4 py-5"
              style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
            >
              <Pressable
                className="rounded-2xl bg-[#ff3b30] px-4 py-3"
                onPress={async () => {
                  await signOut();
                  router.replace('/(tabs)/Loggain');
                }}
              >
                <Text
                  className="text-center font-medium"
                  style={{ color: theme.isDark ? '#ffffff' : theme.text }}
                >
                  Logga ut
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
