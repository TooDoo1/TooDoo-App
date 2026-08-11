import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { CardMedia } from '@/components/ui/card-media';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import {
  computeDiscountLabel,
  getDiscountBadgeColor,
  type OfferCardItem,
} from '@/lib/home-offers';
import {
  searchCatalog,
  sortSearchResultsForView,
  type SearchResultsView,
} from '@/lib/catalog-search';
import { getHomeSearchCache } from '@/lib/home-list-cache';
import {
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getUserCoords,
} from '@/lib/geo';
import { openOfferDetail } from '@/lib/open-offer-detail';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { uiTheme } from '@/lib/ui-theme';

const LIST_BATCH_SIZE = 8;

const VIEW_CONFIG: Record<
  SearchResultsView,
  { title: string; icon: keyof typeof Ionicons.glyphMap; subtitle?: string; emptyText: string }
> = {
  all: {
    title: 'Sökresultat',
    icon: 'search',
    emptyText: 'Inga träffar hittades.',
  },
  near: {
    title: 'Nära dig',
    icon: 'navigate',
    subtitle: 'Baserat på din sökning',
    emptyText: 'Inga träffar nära dig.',
  },
  hot: {
    title: 'Heta erbjudanden',
    icon: 'flame',
    subtitle: 'Baserat på din sökning',
    emptyText: 'Inga heta erbjudanden hittades.',
  },
};

function SearchResultCard({
  card,
  onPress,
  theme,
  badgeLabel,
  imagePriority = 'normal',
}: {
  card: OfferCardItem;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  badgeLabel?: string;
  imagePriority?: 'high' | 'normal';
}) {
  const discount = computeDiscountLabel(card);
  const discountColor = getDiscountBadgeColor(card);
  const offerLabel = Array.isArray(card.erbjudande) ? card.erbjudande[0] : card.erbjudande;

  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-2xl"
      style={{
        width: '100%',
        height: 176,
        backgroundColor: theme.cardBg,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <CardMedia
          source={card.image}
          svgFit="fill"
          priority={imagePriority}
          displayWidth={IMAGE_DISPLAY_WIDTH.card}
        />
      </View>
      <View className="absolute inset-0 bg-black/20" />
      {badgeLabel ? (
        <View
          className="absolute left-2 top-2 rounded-full px-2 py-1"
          style={{ backgroundColor: brandInkRgba(0.75) }}
        >
          <Text className="text-[10px] font-semibold text-white">{badgeLabel}</Text>
        </View>
      ) : null}
      {discount ? (
        <View
          className="absolute right-2 top-2 rounded-md px-2 py-0.5"
          style={{ backgroundColor: discountColor }}
        >
          <Text className="text-[11px] font-semibold text-white">{discount}</Text>
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
          paddingHorizontal: 12,
          paddingBottom: 12,
          paddingTop: 28,
        }}
      >
        <Text className="text-base font-semibold text-white" numberOfLines={1}>
          {card.title}
        </Text>
        <Text className="mt-0.5 text-xs text-white/80" numberOfLines={1}>
          {offerLabel || card.kortbeskrivning || 'Erbjudande'}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export function SearchResultsScreen() {
  const { q, view: viewParam } = useLocalSearchParams<{ q?: string; view?: string }>();
  const query = Array.isArray(q) ? q[0] : q ?? '';
  const viewRaw = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const view: SearchResultsView =
    viewRaw === 'near' || viewRaw === 'hot' ? viewRaw : 'all';
  const config = VIEW_CONFIG[view];

  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [cards, setCards] = useState<OfferCardItem[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await getUserCoords();
      if (!cancelled && resolved) {
        setCoords(resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      try {
        // Prefer the same cards already shown on home (incl. AI/voice results).
        const cached = getHomeSearchCache();
        const cacheMatches =
          cached.query.trim().toLocaleLowerCase('sv-SE') ===
          query.trim().toLocaleLowerCase('sv-SE');
        const results = cacheMatches
          ? cached.results.slice()
          : await searchCatalog(query, { take: 40, maxHydrate: 40 });

        const withDistance = coords
          ? await fillMissingDistancesFromAddresses(results, coords, { maxGeocode: 50 })
          : results;
        const sorted = sortSearchResultsForView(withDistance, view, coords);
        if (!cancelled) {
          setCards(sorted);
          schedulePrefetchImageUris(
            sorted.slice(0, 12).map((card) => card.image),
            16
          );
        }
      } catch {
        if (!cancelled) {
          setCards([]);
        }
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
  }, [coords, query, refreshNonce, view]);

  useEffect(() => {
    if (!coords || cards.length === 0 || view !== 'near') return;

    let cancelled = false;
    void (async () => {
      const enriched = await fillMissingDistancesFromAddresses(cards, coords, { maxGeocode: 50 });
      if (!cancelled) {
        setCards(sortSearchResultsForView(enriched, view, coords));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cards.length, coords, query, refreshNonce, view]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  const handleCardPress = useCallback(
    (card: OfferCardItem) => {
      openOfferDetail(router, card, 'index');
    },
    [router]
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <View className="flex-row items-center">
          <Ionicons name={config.icon} size={22} color={theme.text} />
          <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
            {config.title}
          </Text>
        </View>
        {query ? (
          <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
            Sökning: {query}
          </Text>
        ) : null}
        {config.subtitle ? (
          <Text className="mt-0.5 text-sm" style={{ color: theme.textMuted }}>
            {config.subtitle}
          </Text>
        ) : null}
      </View>
    ),
    [config.icon, config.subtitle, config.title, query, theme.text, theme.textMuted]
  );

  const getBadgeLabel = useCallback(
    (card: OfferCardItem) => {
      if (view !== 'near') return undefined;
      return formatDistanceKm(card.distanceKm) ?? 'Nära dig';
    },
    [view]
  );

  const pagination = usePaginatedList(cards, `${refreshNonce}-${query}-${view}`);

  usePrefetchPageImages(cards, pagination.page, SEE_ALL_PAGE_SIZE, {
    resetKey: `${refreshNonce}-${query}-${view}`,
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
          keyExtractor={(item, idx) => `${item.orderIds?.[0] ?? item.id}-p${pagination.page}-${idx}`}
          renderItem={({ item, index }) => (
            <SearchResultCard
              card={item}
              onPress={() => handleCardPress(item)}
              theme={theme}
              badgeLabel={getBadgeLabel(item)}
              imagePriority={index < 6 ? 'high' : 'normal'}
            />
          )}
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
                {config.emptyText}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
