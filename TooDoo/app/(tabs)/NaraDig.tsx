import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { Ionicons } from '@expo/vector-icons';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import { fetchApprovedBusinessesCatalog } from '@/lib/catalog-cache';
import { normalizeImageUrl } from '@/lib/api';
import { SeeAllCardActions, SeeAllListCard, SeeAllPill } from '@/components/ui/see-all-list-card';
import { getCategoryAccentColor } from '@/lib/category-colors';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useSeeAllFavorite } from '@/hooks/use-see-all-favorite';
import { subscribeCustomLocations } from '@/lib/custom-locations';
import {
  type Coords,
  formatDistanceKm,
  geocodeAddressCached,
  getEffectiveUserCoordsIfGranted,
  getUserCoords,
  getUserCoordsIfGranted,
  haversineKm,
  HELSINGBORG_COORDS,
  isPlausibleSwedenCoordinate,
} from '@/lib/geo';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { BUSINESS_MAP_PATH } from '@/lib/stack-navigation';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import { shareBusiness } from '@/lib/share-offer';
import {
  getHomeNearbyBusinessesCache,
  hasFreshHomeNearbyBusinessesCache,
  setHomeNearbyBusinessesCache,
  type NearbyBusinessCard,
} from '@/lib/home-list-cache';

type NearbyCompany = {
  id: string;
  name: string;
  imageUri?: string;
  address: string;
  description?: string;
  categoryName?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

const GEOCODE_BATCH_SIZE = 4;
const GEOCODE_MAX = 12;
const LIST_BATCH_SIZE = 8;

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

function sortByDistance(list: NearbyCompany[]) {
  return [...list].sort((a, b) => {
    const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, 'sv');
  });
}

function sameCoords(a: Coords | null | undefined, b: Coords | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

function withHaversineDistances(companies: NearbyCompany[], coords: Coords): NearbyCompany[] {
  return sortByDistance(
    companies.map((company) => {
      const lat = company.latitude;
      const lng = company.longitude;
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        isPlausibleSwedenCoordinate(lat, lng)
      ) {
        return {
          ...company,
          distanceKm: haversineKm(coords.lat, coords.lng, lat, lng),
        };
      }
      return company;
    })
  );
}

function cacheToNearbyCompany(card: NearbyBusinessCard): NearbyCompany {
  return {
    id: card.id,
    name: card.title,
    imageUri: card.image.uri || undefined,
    address: card.Adress,
    description: card.kortbeskrivning,
    categoryName: card.categoryName,
    latitude: card.latitude,
    longitude: card.longitude,
    distanceKm: card.distanceKm,
  };
}

function nearbyToCacheItem(company: NearbyCompany): NearbyBusinessCard {
  return {
    id: company.id,
    title: company.name,
    image: { uri: company.imageUri ?? '' },
    Adress: company.address,
    kortbeskrivning: company.description ?? '',
    långbeskrivning: company.description ?? '',
    latitude: company.latitude,
    longitude: company.longitude,
    distanceKm: company.distanceKm,
    categoryName: company.categoryName,
  };
}

const NearbyCompanyCard = memo(function NearbyCompanyCard({
  company,
  onPress,
  imagePriority,
}: {
  company: NearbyCompany;
  onPress: (company: NearbyCompany) => void;
  imagePriority: 'high' | 'normal';
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const distance = formatDistanceKm(company.distanceKm);
  const { isFavorite, onFavoritePress } = useSeeAllFavorite(company.id);
  const accentColor = getCategoryAccentColor(company.categoryName);

  return (
    <SeeAllListCard
      title={company.name}
      subtitle={company.address || company.description?.trim() || undefined}
      meta={[distance, company.categoryName].filter(Boolean).join(' · ') || undefined}
      image={{
        uri:
          company.imageUri ??
          `https://picsum.photos/seed/${encodeURIComponent(company.id)}/300/200`,
      }}
      theme={theme}
      onPress={() => onPress(company)}
      imagePriority={imagePriority}
      accentColor={accentColor}
      topLeft={
        <SeeAllPill
          label={distance ?? 'Nära dig'}
          backgroundColor={brandInkRgba(0.72)}
        />
      }
      topRight={
        <SeeAllCardActions
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={() =>
            void shareBusiness({ businessId: company.id, businessName: company.name })
          }
          shareLabel="Dela verksamhet"
          favoriteColor={FAVORITE_HEART_COLOR}
        />
      }
    />
  );
});

export default function NaraDigScreen() {
  const cachedCompanies = useMemo(() => {
    const cached = getHomeNearbyBusinessesCache();
    return cached?.map(cacheToNearbyCompany) ?? [];
  }, []);

  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [companies, setCompanies] = useState<NearbyCompany[]>(cachedCompanies);
  const [coords, setCoords] = useState<Coords | null>(HELSINGBORG_COORDS);
  const [isLoading, setIsLoading] = useState(cachedCompanies.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useRealtimeSubscription(() => {
    setRefreshNonce((nonce) => nonce + 1);
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await getEffectiveUserCoordsIfGranted().catch(() => null);
      if (!cancelled && resolved) {
        setCoords((prev) => (sameCoords(prev, resolved) ? prev : resolved));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshEffectiveCoords = useCallback(async () => {
    const next = await getEffectiveUserCoordsIfGranted().catch(() => null);
    // Keep the last good fix — don't snap back to Helsingborg on a blip.
    if (!next) return;
    setCoords((prev) => (sameCoords(prev, next) ? prev : next));
  }, []);

  useEffect(
    () =>
      subscribeCustomLocations((state) => {
        void (async () => {
          if (state.activeId) {
            const active = state.locations.find((item) => item.id === state.activeId);
            if (active) {
              const next = { lat: active.lat, lng: active.lng };
              setCoords((prev) => (sameCoords(prev, next) ? prev : next));
              return;
            }
          }
          // Left custom place → device GPS (may prompt). Don't keep stale custom coords.
          const gps =
            (await getUserCoordsIfGranted().catch(() => null)) ??
            (await getUserCoords().catch(() => null)) ??
            HELSINGBORG_COORDS;
          setCoords((prev) => (sameCoords(prev, gps) ? prev : gps));
        })();
      }),
    []
  );

  useFocusEffect(
    useCallback(() => {
      void refreshEffectiveCoords();
    }, [refreshEffectiveCoords])
  );

  useEffect(() => {
    if (!coords) return;
    setCompanies((prev) => {
      if (prev.length === 0) return prev;
      const next = withHaversineDistances(prev, coords);
      setHomeNearbyBusinessesCache(next.map(nearbyToCacheItem));
      return next;
    });
  }, [coords?.lat, coords?.lng]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (refreshNonce === 0 && hasFreshHomeNearbyBusinessesCache()) {
        if (coords) {
          setCompanies((prev) => {
            const next = withHaversineDistances(prev, coords);
            setHomeNearbyBusinessesCache(next.map(nearbyToCacheItem));
            return next;
          });
        }
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (companies.length === 0) {
        setIsLoading(true);
      }
      try {
        const businessesRaw = ((await fetchApprovedBusinessesCatalog()) as any[]).filter(
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
            categoryName: b?.categoryName ?? b?.category?.name ?? undefined,
            latitude: lat,
            longitude: lng,
          };

          return company;
        });

        const sorted = coords ? withHaversineDistances(mapped, coords) : sortByDistance(mapped);
        if (!cancelled) {
          setCompanies(sorted);
          setHomeNearbyBusinessesCache(sorted.map(nearbyToCacheItem));
          schedulePrefetchImageUris(
            sorted.slice(0, 12).map((company) => ({
              uri:
                company.imageUri ??
                `https://picsum.photos/seed/${encodeURIComponent(company.id)}/300/200`,
            })),
            12
          );
        }
      } catch {
        if (!cancelled && companies.length === 0) setCompanies([]);
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

  useEffect(() => {
    if (!coords || companies.length === 0) return;

    let cancelled = false;
    const needGeocode = companies
      .filter((c) => c.address && c.address !== 'Adress saknas')
      .slice(0, GEOCODE_MAX);

    if (needGeocode.length === 0) return;

    void (async () => {
      const distanceById = new Map<string, number>();

      for (let i = 0; i < needGeocode.length; i += GEOCODE_BATCH_SIZE) {
        if (cancelled) return;
        const batch = needGeocode.slice(i, i + GEOCODE_BATCH_SIZE);
        await Promise.all(
          batch.map(async (company) => {
            const geo = await geocodeAddressCached(company.address);
            if (geo) {
              distanceById.set(company.id, haversineKm(coords.lat, coords.lng, geo.lat, geo.lng));
            }
          })
        );
      }

      if (cancelled || distanceById.size === 0) return;

      setCompanies((prev) => {
        const next = sortByDistance(
          prev.map((c) =>
            distanceById.has(c.id) ? { ...c, distanceKm: distanceById.get(c.id) } : c
          )
        );
        setHomeNearbyBusinessesCache(next.map(nearbyToCacheItem));
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [coords, companies.length, refreshNonce]);

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

  const headerNote = coords
    ? 'Sorterat efter avstånd från din plats.'
    : 'Aktivera plats för att se avstånd till varje företag.';

  const renderItem = useCallback(
    ({ item, index }: { item: NearbyCompany; index: number }) => (
      <NearbyCompanyCard
        company={item}
        onPress={openCompany}
        imagePriority={index < 6 ? 'high' : 'normal'}
      />
    ),
    [openCompany]
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <View className="flex-row items-start justify-between">
          <View className="min-w-0 flex-1 pr-3">
            <Text
              style={{
                color: theme.text,
                fontSize: 28,
                fontWeight: '800',
                letterSpacing: -0.5,
                lineHeight: 32,
              }}
            >
              Nära dig
            </Text>
            <Text className="mt-1.5 text-sm" style={{ color: theme.textMuted, lineHeight: 20 }}>
              {headerNote}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Visa på karta"
            onPress={() => {
              if (Platform.OS === 'web') {
                void import('@/components/ui/maplibre-map.web').then((mod) => {
                  mod.prefetchBusinessMapAssets();
                });
              }
              router.push({
                pathname: BUSINESS_MAP_PATH,
                params: { returnTo: 'naradig' },
              });
            }}
            className="mt-1 flex-row items-center rounded-full px-3 py-2"
            style={{
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Ionicons name="map-outline" size={16} color={theme.text} />
            <Text className="ml-1.5 text-xs font-semibold" style={{ color: theme.text }}>
              Karta
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [headerNote, router, theme.border, theme.cardBg, theme.text, theme.textMuted]
  );

  const pagination = usePaginatedList(companies, refreshNonce);

  const selectNearbyImage = useCallback(
    (company: NearbyCompany) => ({
      uri:
        company.imageUri ??
        `https://picsum.photos/seed/${encodeURIComponent(company.id)}/300/200`,
    }),
    []
  );

  usePrefetchPageImages(companies, pagination.page, SEE_ALL_PAGE_SIZE, {
    resetKey: refreshNonce,
    selectImage: selectNearbyImage,
  });

  const listFooter = useMemo(
    () => (
      <PaginatedListFooter
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        canGoPrevious={pagination.canGoPrevious}
        canGoNext={pagination.canGoNext}
        onPrevious={pagination.goToPrevious}
        onNext={pagination.goToNext}
        theme={theme}
      />
    ),
    [pagination, theme]
  );

  return (
    <WebStackSwipeContainer>
      <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
        <StackScreenTabBarSync />
        <ScreenBackButton />
        <FlatList
          data={pagination.pageItems}
          keyExtractor={(item) => `${item.id}-p${pagination.page}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
          }}
          ItemSeparatorComponent={ListItemSeparator}
          initialNumToRender={6}
          maxToRenderPerBatch={LIST_BATCH_SIZE}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.text} />
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="mt-10 items-center">
                <ActivityIndicator color={theme.text} />
              </View>
            ) : (
              <Text className="mt-10" style={{ color: theme.textMuted }}>
                Inga företag att visa just nu.
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
