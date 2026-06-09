import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { CardMedia } from '@/components/ui/card-media';
import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import {
  type Coords,
  formatDistanceKm,
  geocodeAddressCached,
  getUserCoords,
  haversineKm,
} from '@/lib/geo';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import { prefetchImageUris } from '@/lib/image-prefetch';

type NearbyCompany = {
  id: string;
  name: string;
  imageUri?: string;
  address: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

function parseBusinesses(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function pickImageUri(business: any): string | undefined {
  const raw =
    business?.image?.publicUrl ??
    business?.image?.url ??
    business?.imageUrl ??
    business?.logoUrl ??
    business?.logo?.url ??
    (Array.isArray(business?.images) ? business.images[0] : undefined);
  return normalizeImageUrl(raw) ?? undefined;
}

export default function NaraDigScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, role } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [companies, setCompanies] = useState<NearbyCompany[]>([]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await getUserCoords();
      if (!cancelled && resolved) setCoords(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sortByDistance = (list: NearbyCompany[]) =>
      [...list].sort((a, b) => {
        const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
        const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name, 'sv');
      });

    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl('/business?status=APPROVED'));
        const json = await res.json().catch(() => []);
        const businessesRaw = parseBusinesses(json).filter(
          (b) => (b?.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
        );

        const mapped: NearbyCompany[] = businessesRaw.map((b, index) => {
          const id = String(b?.id ?? b?._id ?? `business-${index}`);
          const lat = typeof b?.latitude === 'number' ? b.latitude : undefined;
          const lng = typeof b?.longitude === 'number' ? b.longitude : undefined;
          const address = [b?.address, b?.city].filter(Boolean).join(', ') || 'Adress saknas';

          const company: NearbyCompany = {
            id,
            name: b?.name ?? 'Okänd verksamhet',
            imageUri: pickImageUri(b),
            address,
            description: b?.description ?? undefined,
            latitude: lat,
            longitude: lng,
          };

          if (coords && typeof lat === 'number' && typeof lng === 'number') {
            company.distanceKm = haversineKm(coords.lat, coords.lng, lat, lng);
          }

          return company;
        });

        if (!cancelled) setCompanies(sortByDistance(mapped));

        if (coords) {
          const needGeocode = mapped.filter(
            (c) => typeof c.distanceKm !== 'number' && c.address && c.address !== 'Adress saknas'
          );
          const distanceById = new Map<string, number>();
          for (const company of needGeocode) {
            const geo = await geocodeAddressCached(company.address);
            if (cancelled) return;
            if (geo) {
              distanceById.set(company.id, haversineKm(coords.lat, coords.lng, geo.lat, geo.lng));
            }
          }
          if (!cancelled && distanceById.size > 0) {
            setCompanies((prev) =>
              sortByDistance(
                prev.map((c) =>
                  distanceById.has(c.id) ? { ...c, distanceKm: distanceById.get(c.id) } : c
                )
              )
            );
          }
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
  }, [coords, refreshNonce]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  const openCompany = useCallback(
    (company: NearbyCompany) => {
      router.push({
        pathname: COMPANY_DETAIL_PATH,
        params: {
          returnTo: 'naradig',
          id: company.id,
          claimBusinessId: company.id,
          title: company.name,
          deal: '1',
          imageUri: company.imageUri ?? '',
          Adress: company.address,
          latitude: company.latitude?.toString(),
          longitude: company.longitude?.toString(),
          kortbeskrivning: company.description ?? '',
          långbeskrivning: company.description ?? '',
          mapResetNonce: `${Date.now()}-${Math.random()}`,
        },
      });
    },
    [router]
  );

  const headerNote = useMemo(() => {
    if (coords) return 'Sorterat efter avstånd från din plats.';
    return 'Aktivera plats för att se avstånd till varje företag.';
  }, [coords]);

  return (
    <WebStackSwipeContainer>
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StackScreenTabBarSync />
      <StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
      <ScreenBackButton />
      <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.text} />
          }
        >
          <View className="flex-row items-center">
            <Ionicons name="navigate" size={22} color="#ff3b30" />
            <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
              Nära dig
            </Text>
          </View>
          <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
            {headerNote}
          </Text>

          {isLoading && companies.length === 0 ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={theme.text} />
            </View>
          ) : companies.length === 0 ? (
            <Text className="mt-10" style={{ color: theme.textMuted }}>
              Inga företag att visa just nu.
            </Text>
          ) : (
            <View className="mt-5" style={{ gap: 12 }}>
              {companies.map((company) => {
                const distance = formatDistanceKm(company.distanceKm);
                return (
                  <Pressable
                    key={company.id}
                    onPress={() => openCompany(company)}
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
                          uri:
                            company.imageUri ??
                            `https://picsum.photos/seed/${encodeURIComponent(company.id)}/300/200`,
                        }}
                        svgFit="fill"
                        priority="high"
                      />
                      <View className="absolute inset-0 bg-black/20" />

                      {distance ? (
                        <View
                          className="absolute left-2 top-2 rounded-full px-2 py-1"
                          style={{ backgroundColor: 'rgba(0,11,42,0.75)' }}
                        >
                          <Text className="text-[10px] font-semibold text-white">{distance}</Text>
                        </View>
                      ) : (
                        <View
                          className="absolute left-2 top-2 rounded-full px-2 py-1"
                          style={{ backgroundColor: 'rgba(0,11,42,0.75)' }}
                        >
                          <Text className="text-[10px] font-semibold text-white">Nära dig</Text>
                        </View>
                      )}

                      {token && role === 'USER' ? (
                        <View
                          className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
                          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                        >
                          <Pressable
                            onPress={async (e: any) => {
                              e?.stopPropagation?.();
                              await toggleFavorite(company.id);
                            }}
                            hitSlop={10}
                            style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons
                              name={isFavorite(company.id) ? 'heart' : 'heart-outline'}
                              size={18}
                              color={isFavorite(company.id) ? FAVORITE_HEART_COLOR : '#ffffff'}
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
                          {company.name}
                        </Text>
                        <Text className="mt-0.5 text-[11px] text-white/80" numberOfLines={1}>
                          {company.address}
                        </Text>
                      </LinearGradient>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
    </View>
    </WebStackSwipeContainer>
  );
}

