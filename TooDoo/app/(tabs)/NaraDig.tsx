import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import { fetchApprovedBusinessesCatalog } from '@/lib/catalog-cache';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { CardMedia } from '@/components/ui/card-media';
import { CompanyActivityDots } from '@/components/ui/company-activity-dots';
import { fetchBusinessEvents } from '@/lib/business-events';
import { getHomeEventsCache } from '@/lib/home-list-cache';
import { getOrderBusinessId, isActiveOffer, parseOrdersList } from '@/lib/offers';
import { useAuth } from '@/context/auth-context';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useFavorites } from '@/context/favorites-context';
import {
  type Coords,
  formatDistanceKm,
  geocodeAddressCached,
  getUserCoords,
  haversineKm,
} from '@/lib/geo';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
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

function cacheToNearbyCompany(card: NearbyBusinessCard): NearbyCompany {
  return {
    id: card.id,
    name: card.title,
    imageUri: card.image.uri || undefined,
    address: card.Adress,
    description: card.kortbeskrivning,
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
  };
}

const NearbyCompanyCard = memo(function NearbyCompanyCard({
  company,
  showFavorite,
  isFavorite,
  onToggleFavorite,
  onPress,
  imagePriority,
  hasEvent,
  hasOffer,
}: {
  company: NearbyCompany;
  showFavorite: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onPress: (company: NearbyCompany) => void;
  imagePriority: 'high' | 'normal';
  hasEvent: boolean;
  hasOffer: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const distance = formatDistanceKm(company.distanceKm);

  return (
    <Pressable
      onPress={() => onPress(company)}
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
          priority={imagePriority}
          displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
        />
        <View className="absolute inset-0 bg-black/20" />

        <View className="absolute left-2 top-2">
          <View
            className="rounded-full px-2 py-1"
            style={{ backgroundColor: brandInkRgba(0.75) }}
          >
            <Text className="text-[10px] font-semibold text-white">{distance ?? 'Nära dig'}</Text>
          </View>
          <CompanyActivityDots
            hasEvent={hasEvent}
            hasOffer={hasOffer}
            eventColor={theme.eventColor}
          />
        </View>

        {showFavorite ? (
          <View
            className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <Pressable
              onPress={(e: any) => {
                e?.stopPropagation?.();
                void onToggleFavorite(company.id);
              }}
              hitSlop={10}
              style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color={isFavorite ? FAVORITE_HEART_COLOR : '#ffffff'}
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
  const { isLoggedIn, role } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [companies, setCompanies] = useState<NearbyCompany[]>(cachedCompanies);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isLoading, setIsLoading] = useState(cachedCompanies.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [businessIdsWithEvents, setBusinessIdsWithEvents] = useState<Set<string>>(() => {
    const cached = getHomeEventsCache();
    return new Set(
      (cached ?? [])
        .map((event) => event.businessId)
        .filter((businessId): businessId is string => Boolean(businessId))
    );
  });
  const [businessIdsWithOffers, setBusinessIdsWithOffers] = useState<Set<string>>(new Set());

  const showFavorite = Boolean(isLoggedIn && role === 'USER');

  useRealtimeSubscription(() => {
    setRefreshNonce((nonce) => nonce + 1);
  });

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

    void (async () => {
      const [events, ordersRes] = await Promise.all([
        fetchBusinessEvents(),
        fetch(apiUrl('/orders')),
      ]);

      if (cancelled) return;

      setBusinessIdsWithEvents(new Set(events.map((event) => event.businessId)));

      const ordersJson = await ordersRes.json().catch(() => []);
      const offerBusinessIds = new Set<string>();
      parseOrdersList(ordersJson).forEach((order) => {
        if (!isActiveOffer(order)) return;
        const businessId = getOrderBusinessId(order);
        if (businessId) offerBusinessIds.add(businessId);
      });
      setBusinessIdsWithOffers(offerBusinessIds);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (refreshNonce === 0 && hasFreshHomeNearbyBusinessesCache()) {
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
            latitude: lat,
            longitude: lng,
          };

          return company;
        });

        const sorted = sortByDistance(mapped);
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
        showFavorite={showFavorite}
        isFavorite={isFavorite(item.id)}
        onToggleFavorite={toggleFavorite}
        onPress={openCompany}
        imagePriority={index < 6 ? 'high' : 'normal'}
        hasEvent={businessIdsWithEvents.has(item.id)}
        hasOffer={businessIdsWithOffers.has(item.id)}
      />
    ),
    [businessIdsWithEvents, businessIdsWithOffers, showFavorite, isFavorite, toggleFavorite, openCompany]
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <View className="flex-row items-center">
          <Ionicons name="navigate" size={22} color="#ff3b30" />
          <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
            Nära dig
          </Text>
        </View>
        <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
          {headerNote}
        </Text>
      </View>
    ),
    [headerNote, theme.text, theme.textMuted]
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
