import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import { brandInkRgba } from '@/lib/brand-colors';
import { HOME_PAGE_PAD, HomeCardGrid } from '@/components/home/home-feed';
import { cardsFromCatalogBusinesses, type OfferCardItem } from '@/lib/home-offers';
import { openOfferDetail } from '@/lib/open-offer-detail';

async function fetchFavoriteBusinesses(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  favoriteIds: string[]
) {
  const res = await authFetch('/user/me');
  const json = await res.json().catch(() => ({}));
  const fromProfile = Array.isArray(json?.favoriteBusinesses) ? json.favoriteBusinesses : [];

  if (fromProfile.length > 0) {
    const favoriteIdSet = new Set(favoriteIds);
    return fromProfile.filter((business: { id?: string; _id?: string }) =>
      favoriteIdSet.has(String(business?.id ?? business?._id))
    );
  }

  if (favoriteIds.length === 0) {
    return [];
  }

  const results = await Promise.all(
    favoriteIds.map(async (id) => {
      try {
        const businessRes = await fetch(apiUrl(`/business/${encodeURIComponent(id)}`));
        if (!businessRes.ok) return null;
        return businessRes.json().catch(() => null);
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

export default function FavoriterScreen() {
  const router = useRouter();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom, undefined, 24);
  const { token, isLoggedIn, role, authFetch } = useAuth();
  const { favoriteBusinessIds } = useFavorites();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [companies, setCompanies] = useState<any[]>([]);

  const favoriteIds = useMemo(() => Array.from(favoriteBusinessIds), [favoriteBusinessIds]);
  const favoriteIdsKey = favoriteIds.join('|');

  const favoriteCards = useMemo(
    () => cardsFromCatalogBusinesses(companies) as OfferCardItem[],
    [companies]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setCompanies([]);
        setIsLoading(false);
        return;
      }

      if (favoriteIds.length === 0) {
        setCompanies([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setIsLoading(true);
      try {
        const filtered = await fetchFavoriteBusinesses(authFetch, favoriteIds);
        if (!cancelled) {
          setCompanies(filtered);
          schedulePrefetchImageUris(
            filtered.slice(0, 12).map((company: { image?: { publicUrl?: string; url?: string }; imageUrl?: string }) => ({
              uri: normalizeImageUrl(company?.image?.publicUrl ?? company?.image?.url ?? company?.imageUrl),
            })),
            12
          );
        }
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshNonce, favoriteIdsKey, authFetch, favoriteIds]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              setRefreshNonce((n) => n + 1);
            }}
            tintColor={theme.text}
          />
        }
      >
        <View
          style={{
            minHeight: '100%',
            paddingHorizontal: HOME_PAGE_PAD,
            paddingTop: Math.max(insets.top + 20, 72),
          }}
        >
          <View style={styles.hero}>
            <Ionicons name="heart" size={26} color={FAVORITE_HEART_COLOR} />

            <View style={styles.heroCopy}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.text }]}>Favoriter</Text>
                {isLoggedIn && role === 'USER' && favoriteCards.length > 0 ? (
                  <View
                    style={[
                      styles.countPill,
                      {
                        backgroundColor: brandInkRgba(theme.isDark ? 0.16 : 0.06),
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.countText, { color: theme.textMuted }]}>
                      {favoriteCards.length}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                {isLoggedIn && role === 'USER'
                  ? favoriteCards.length > 0
                    ? 'Dina sparade ställen'
                    : 'Spara ställen du vill hitta igen'
                  : 'Dina sparade ställen'}
              </Text>
            </View>
          </View>

          {!isLoggedIn || role !== 'USER' ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="heart-outline"
                size={42}
                color={FAVORITE_HEART_COLOR}
                style={{ opacity: 0.85 }}
              />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Spara ställen du gillar
              </Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Logga in så synkas dina favoriter mellan enheter.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/Loggain')}
                style={({ pressed }) => [
                  styles.ctaSolid,
                  { opacity: pressed ? 0.88 : 1 },
                ]}
              >
                <Text style={styles.ctaSolidLabel}>Logga in</Text>
              </Pressable>
            </View>
          ) : isLoading && companies.length === 0 ? (
            <LoadingSpinner variant="screen" label="Laddar favoriter..." />
          ) : companies.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="heart-outline"
                size={42}
                color={FAVORITE_HEART_COLOR}
                style={{ opacity: 0.85 }}
              />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Inga favoriter ännu
              </Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Utforska och tryck på hjärtat för att spara ställen här.
              </Text>
              <Pressable
                onPress={() => router.push('/')}
                style={({ pressed }) => [
                  styles.ctaSolid,
                  { opacity: pressed ? 0.88 : 1 },
                ]}
              >
                <Text style={styles.ctaSolidLabel}>Utforska</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <HomeCardGrid
                cards={favoriteCards}
                onCardPress={(card) => openOfferDetail(router, card, 'favoriter')}
                emptyText="Du har inga favoriter ännu."
                maxItems={null}
                columns={1}
                compact
                showFavoriteButton
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  countPill: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  emptyState: {
    marginTop: 56,
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: -0.1,
    textAlign: 'center',
    maxWidth: 280,
  },
  ctaSolid: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  ctaSolidLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
