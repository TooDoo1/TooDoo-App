import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { CardMedia } from '@/components/ui/card-media';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';

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
  const { favoriteBusinessIds, isFavorite, toggleFavorite } = useFavorites();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [companies, setCompanies] = useState<any[]>([]);

  const favoriteIds = useMemo(() => Array.from(favoriteBusinessIds), [favoriteBusinessIds]);
  const favoriteIdsKey = favoriteIds.join('|');

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
        <View className="min-h-full px-6 pt-24">
          <View className="flex-row items-center justify-center">
            <Ionicons name="heart" size={28} color={FAVORITE_HEART_COLOR} />
            <Text className="ml-2 text-3xl font-semibold" style={{ color: theme.text }}>
              Favoriter
            </Text>
          </View>

          {isLoggedIn && role === 'USER' ? (
            <Text className="mt-2 pt-4 text-center text-xl" style={{ color: theme.textMuted }}>
              Alla verksamheter du har hjärtat.
            </Text>
          ) : null}

          {!isLoggedIn || role !== 'USER' ? (
            <View className="mt-8 px-4">
              <Text className="mb-4 text-center" style={{ color: theme.textMuted }}>
                Logga in för att spara och se dina favoriter.
              </Text>
              <Pressable
                className="rounded-xl px-4 py-3"
                onPress={() => router.push('/(tabs)/Loggain')}
                style={{ backgroundColor: OFFERS_CATEGORY_ACCENT }}
              >
                <Text className="text-center font-semibold text-white">Logga in för att favoritisera!</Text>
              </Pressable>
            </View>
          ) : isLoading && companies.length === 0 ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={theme.text} />
            </View>
          ) : companies.length === 0 ? (
            <View className="mt-8 px-4">
              <Text className="mb-4 text-center" style={{ color: theme.textMuted }}>
                Du har inga favoriter ännu. Utforska verksamheter och spara dem här.
              </Text>
              <Pressable
                className="rounded-xl px-4 py-3"
                onPress={() => router.push('/')}
                style={{ backgroundColor: OFFERS_CATEGORY_ACCENT }}
              >
                <Text className="text-center font-semibold text-white">Favoritisera</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mt-5" style={{ gap: 12 }}>
              {companies.map((company, idx) => {
                const id = String(company?.id ?? company?._id ?? `business-${idx}`);
                const imageUri = normalizeImageUrl(company?.image?.publicUrl ?? company?.image?.url ?? company?.imageUrl);
                const address = [company?.address, company?.city].filter(Boolean).join(', ') || 'Adress saknas';

                return (
                  <Pressable
                    key={id}
                    onPress={() =>
                      router.push({
                        pathname: COMPANY_DETAIL_PATH,
                        params: {
                          returnTo: 'favoriter',
                          id,
                          claimBusinessId: id,
                          title: company?.name ?? 'Okänd verksamhet',
                          deal: '1',
                          imageUri: imageUri ?? '',
                          Adress: address,
                          latitude: company?.latitude?.toString(),
                          longitude: company?.longitude?.toString(),
                          Telefon: company?.contactPhone ?? '',
                          Website: company?.website ?? '',
                          kortbeskrivning: company?.description ?? '',
                          långbeskrivning: company?.description ?? '',
                          mapResetNonce: `${Date.now()}-${Math.random()}`,
                        },
                      })
                    }
                    className="overflow-hidden rounded-2xl"
                    style={{
                      width: '100%',
                      backgroundColor: theme.cardBg,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <View className="relative h-44 w-full">
                      <CardMedia
                        source={{
                          uri: imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(id)}/600/400`,
                        }}
                        svgFit="fill"
                      />
                      <View className="absolute inset-0 bg-black/20" />

                      {isLoggedIn && role === 'USER' ? (
                        <View
                          className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
                          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                        >
                          <Pressable
                            onPress={async (e: any) => {
                              e?.stopPropagation?.();
                              await toggleFavorite(id);
                            }}
                            hitSlop={10}
                            style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons
                              name={isFavorite(id) ? 'heart' : 'heart-outline'}
                              size={18}
                              color={isFavorite(id) ? FAVORITE_HEART_COLOR : '#ffffff'}
                            />
                          </Pressable>
                        </View>
                      ) : null}

                      <LinearGradient
                        colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.85)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: '55%',
                          paddingHorizontal: 10,
                          paddingBottom: 10,
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                          {company?.name ?? 'Okänd verksamhet'}
                        </Text>
                        <Text className="mt-0.5 text-[11px] text-white/80" numberOfLines={1}>
                          {address}
                        </Text>
                      </LinearGradient>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
