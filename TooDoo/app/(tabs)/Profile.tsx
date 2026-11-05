import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { HOME_PAGE_PAD } from '@/components/home/home-feed';
import { ProfileMenuRow } from '@/components/profile/profile-menu-row';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { getProfileDisplayName, type UserProfile } from '@/lib/profile';
import { TAB_ACTIVE_COLORS } from '@/lib/tab-colors';
import { uiTheme } from '@/lib/ui-theme';

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.textFaint }]}>{title}</Text>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: theme.cardBg,
            borderColor: theme.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, token, authFetch } = useAuth();
  const { mode, setMode } = useThemePreference();
  const theme = uiTheme(mode);
  const isLightMode = mode === 'light';
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom, undefined, 32);
  const profileAccent = TAB_ACTIVE_COLORS.Profile;

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
  const initial = (displayName.trim().charAt(0) || '?').toUpperCase();

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.screenBg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
    >
      <View
        style={{
          minHeight: '100%',
          paddingHorizontal: HOME_PAGE_PAD,
          paddingTop: Math.max(insets.top + 20, 72),
        }}
      >
        <View style={styles.hero}>
          <Ionicons name="settings" size={26} color={profileAccent} />
          <View style={styles.heroCopy}>
            <Text style={[styles.title, { color: theme.text }]}>Profil</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Konto och inställningar
            </Text>
          </View>
        </View>

        {isLoading ? (
          <LoadingSpinner variant="screen" label="Laddar profil..." style={styles.loadingWrap} />
        ) : (
          <>
            <View
              style={[
                styles.identityCard,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: `${profileAccent}22` },
                ]}
              >
                <Text style={[styles.avatarLetter, { color: profileAccent }]}>{initial}</Text>
              </View>
              <View style={styles.identityCopy}>
                <Text style={[styles.identityName, { color: theme.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                {profile?.email ? (
                  <Text style={[styles.identityEmail, { color: theme.textMuted }]} numberOfLines={1}>
                    {profile.email}
                  </Text>
                ) : null}
              </View>
            </View>

            <ProfileSection title="Konto">
              <ProfileMenuRow
                label="Konto"
                description="Namn, kön och intressen"
                icon="person-outline"
                onPress={() => router.push('/profile-konto')}
              />
              <ProfileMenuRow
                label="Plats"
                description="Egna platser utan GPS"
                icon="location"
                iconColor="#ff3b30"
                onPress={() => router.push('/profile-plats')}
              />
              <ProfileMenuRow
                label="Säkerhet"
                description="Byt lösenord"
                icon="lock-closed-outline"
                onPress={() => router.push('/profile-security')}
                isLast
              />
            </ProfileSection>

            <ProfileSection title="Support">
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
            </ProfileSection>

            <ProfileSection title="Inställningar">
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>Notiser</Text>
                  <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                    Påminnelser om deals och erbjudanden
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: '#3a3a3c', true: '#34c759' }}
                  thumbColor="#ffffff"
                />
              </View>
              <View style={[styles.settingDivider, { backgroundColor: theme.border }]} />
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>Ljust läge</Text>
                  <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                    Växla mellan mörkt och ljust tema
                  </Text>
                </View>
                <Switch
                  value={isLightMode}
                  onValueChange={(next) => setMode(next ? 'light' : 'dark')}
                  trackColor={{ false: '#3a3a3c', true: theme.accentGreen }}
                  thumbColor="#ffffff"
                />
              </View>
            </ProfileSection>

            <Pressable
              onPress={async () => {
                await signOut();
                router.replace('/(tabs)/Loggain');
              }}
              style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={styles.logoutLabel}>Logga ut</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  loadingWrap: {
    marginTop: 40,
    alignItems: 'center',
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  identityEmail: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginTop: 22,
  },
  sectionLabel: {
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  settingDesc: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  logoutBtn: {
    marginTop: 28,
    marginBottom: 8,
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    paddingHorizontal: 28,
    paddingVertical: 12,
    minWidth: 160,
  },
  logoutLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
