import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { CategoryFilterBar } from '@/components/ui/category-filter-bar';
import { ALL_CATEGORIES_ID } from '@/lib/category-filters';
import { ListItemSeparator, SEE_ALL_COLUMN_GAP } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { Ionicons } from '@expo/vector-icons';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { fetchApprovedBusinessesCatalog } from '@/lib/catalog-cache';
import { normalizeImageUrl } from '@/lib/api';
import { SeeAllCardActions, SeeAllListCard } from '@/components/ui/see-all-list-card';
import { getCategoryAccentColor } from '@/lib/category-colors';
import { formatTodayOpeningHoursLabel } from '@/lib/business-opening-hours';
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
import {
  cardMatchesCategory,
  resolveBusinessCategoryIds,
  type OfferCardItem,
} from '@/lib/home-offers';
import { BUSINESS_MAP_PATH } from '@/lib/stack-navigation';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import { shareBusiness } from '@/lib/share-offer';
import {
  getHomeNearbyBusinessesCache,
  getHomeScreenSnapshot,
  hasFreshHomeNearbyBusinessesCache,
  peekHomeNearbyBusinessesCache,
  setHomeNearbyBusinessesCache,
  type NearbyBusinessCard,
} from '@/lib/home-list-cache';

type NearbyCompany = {
  id: string;
  name: string;
  imageUri?: string;
  address: string;
  description?: string;
  categoryId?: string;
  categoryIds?: string[];
  categoryName?: string;
  openingHours?: unknown;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

function nearbyOpeningHoursLabel(company: NearbyCompany): string | undefined {
  return formatTodayOpeningHoursLabel(company.openingHours);
}

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function dealCardToNearbyCompany(card: OfferCardItem): NearbyCompany {
  const uri =
    typeof card.image === 'object' &&
    card.image &&
    'uri' in card.image &&
    typeof card.image.uri === 'string'
      ? card.image.uri
      : undefined;
  return {
    id: card.id,
    name: card.title,
    imageUri: uri,
    address: card.Adress || 'Adress saknas',
    description: card.kortbeskrivning,
    categoryId: card.categoryId,
    categoryIds: card.categoryIds,
    categoryName: card.categoryName,
    openingHours: card.openingHours,
    latitude: card.latitude,
    longitude: card.longitude,
    distanceKm: card.distanceKm,
  };
}

function companyMatchesCategoryFilter(
  company: NearbyCompany,
  categoryId?: string,
  categoryName?: string
) {
  if (!categoryId && !categoryName) return true;
  if (categoryId && cardMatchesCategory(company, categoryId)) return true;
  if (categoryName) {
    const want = categoryName.trim().toLocaleLowerCase('sv-SE');
    const have = company.categoryName?.trim().toLocaleLowerCase('sv-SE') ?? '';
    if (want && have === want) return true;
  }
  return false;
}

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
    categoryId: card.categoryId,
    categoryIds: card.categoryIds,
    categoryName: card.categoryName,
    openingHours: card.openingHours,
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
    categoryId: company.categoryId,
    categoryIds: company.categoryIds,
    categoryName: company.categoryName,
    openingHours: company.openingHours,
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
      hours={nearbyOpeningHoursLabel(company)}
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
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    categoryName?: string | string[];
  }>();
  const paramCategoryId = paramString(params.categoryId) || undefined;
  const paramCategoryName = paramString(params.categoryName) || undefined;
  const [activeCategoryId, setActiveCategoryId] = useState(
    paramCategoryId || ALL_CATEGORIES_ID
  );
  const [activeCategoryName, setActiveCategoryName] = useState(paramCategoryName);
  const categoryId =
    activeCategoryId !== ALL_CATEGORIES_ID ? activeCategoryId : undefined;
  const categoryName = activeCategoryName;
  const hasCategoryFilter = Boolean(categoryId || categoryName);

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
      const cached = peekHomeNearbyBusinessesCache();
      if (refreshNonce === 0 && hasFreshHomeNearbyBusinessesCache() && cached && cached.length > 0) {
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

      // Instant paint from home deals snapshot while catalog catches up.
      if (companies.length === 0) {
        const snapDeals = (getHomeScreenSnapshot()?.deals as OfferCardItem[] | undefined) ?? [];
        if (snapDeals.length > 0) {
          const fromSnap = snapDeals.map(dealCardToNearbyCompany);
          const sortedSnap = coords
            ? withHaversineDistances(fromSnap, coords)
            : sortByDistance(fromSnap);
          setCompanies(sortedSnap);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }

      try {
        // Catalog is stale-while-revalidate — usually already warm from home.
        const businessesRaw = ((await fetchApprovedBusinessesCatalog()) as any[]).filter(
          (b) => (b?.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
        );

        const mapped: NearbyCompany[] = businessesRaw.map((b, index) => {
          const id = String(b?.id ?? b?._id ?? `business-${index}`);
          const lat = typeof b?.latitude === 'number' ? b.latitude : undefined;
          const lng = typeof b?.longitude === 'number' ? b.longitude : undefined;
          const address = [b?.address, b?.city].filter(Boolean).join(', ') || 'Adress saknas';

          const categoryIds = resolveBusinessCategoryIds(b);
          return {
            id,
            name: b?.name ?? 'Okänd verksamhet',
            imageUri: pickImageUri(b),
            address,
            description: b?.description ?? undefined,
            categoryId: categoryIds[0],
            categoryIds,
            categoryName: b?.categoryName ?? b?.category?.name ?? undefined,
            openingHours: b?.openingHours,
            latitude: lat,
            longitude: lng,
          };
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
  }, [refreshNonce]);

  useEffect(() => {
    if (!coords || companies.length === 0) return;

    let cancelled = false;
    const needGeocode = companies
      .filter(
        (c) =>
          c.distanceKm == null &&
          (c.latitude == null || c.longitude == null) &&
          c.address &&
          c.address !== 'Adress saknas'
      )
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
    ? hasCategoryFilter
      ? `Visar ${categoryName ?? 'kategori'} nära dig.`
      : 'Sorterat efter avstånd från din plats.'
    : 'Aktivera plats för att se avstånd till varje företag.';

  const visibleCompanies = useMemo(
    () =>
      companies.filter((company) =>
        companyMatchesCategoryFilter(company, categoryId, categoryName)
      ),
    [categoryId, categoryName, companies]
  );

  const listTitle = 'Nära dig';

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
              {listTitle}
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
                params: {
                  returnTo: 'naradig',
                  ...(categoryId ? { categoryId } : {}),
                  ...(categoryName ? { categoryName } : {}),
                },
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
        <CategoryFilterBar
          selectedId={activeCategoryId}
          onSelect={(id, label) => {
            setActiveCategoryId(id);
            setActiveCategoryName(label);
          }}
        />
      </View>
    ),
    [
      activeCategoryId,
      categoryId,
      categoryName,
      headerNote,
      listTitle,
      router,
      theme.border,
      theme.cardBg,
      theme.text,
      theme.textMuted,
    ]
  );

  const pagination = usePaginatedList(
    visibleCompanies,
    `${refreshNonce}-${categoryId ?? ''}-${categoryName ?? ''}`
  );

  const selectNearbyImage = useCallback(
    (company: NearbyCompany) => ({
      uri:
        company.imageUri ??
        `https://picsum.photos/seed/${encodeURIComponent(company.id)}/300/200`,
    }),
    []
  );

  usePrefetchPageImages(visibleCompanies, pagination.page, SEE_ALL_PAGE_SIZE, {
    resetKey: `${refreshNonce}-${categoryId ?? ''}-${categoryName ?? ''}`,
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
          numColumns={2}
          columnWrapperStyle={{ gap: SEE_ALL_COLUMN_GAP }}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
          }}
          ItemSeparatorComponent={ListItemSeparator}
          initialNumToRender={8}
          maxToRenderPerBatch={LIST_BATCH_SIZE}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.text} />
          }
          ListEmptyComponent={
            isLoading ? (
              <LoadingSpinner variant="screen" label="Laddar..." />
            ) : (
              <Text className="mt-10" style={{ color: theme.textMuted }}>
                {hasCategoryFilter
                  ? `Inga träffar i ${categoryName ?? 'denna kategori'} just nu.`
                  : 'Inga företag att visa just nu.'}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
