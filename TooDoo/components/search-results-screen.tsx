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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { SeeAllCardActions, SeeAllListCard, SeeAllPill } from '@/components/ui/see-all-list-card';
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
import {
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getEffectiveUserCoords,
  resolveUserCityFromDevice,
} from '@/lib/geo';
import { openOfferDetail } from '@/lib/open-offer-detail';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { getCategoryAccentForItem } from '@/lib/category-colors';
import { uiTheme } from '@/lib/ui-theme';
import { useSeeAllFavorite } from '@/hooks/use-see-all-favorite';
import { shareEvent, shareOfferFromCard } from '@/lib/share-offer';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';

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
  const distance = formatDistanceKm(card.distanceKm);
  const isEvent = card.resultKind === 'event';
  const pillLabel = badgeLabel ?? discount ?? (isEvent ? 'Event' : undefined);
  const pillColor = badgeLabel
    ? brandInkRgba(0.72)
    : discount
      ? discountColor
      : isEvent
        ? theme.eventColor
        : undefined;
  const { isFavorite, onFavoritePress } = useSeeAllFavorite(isEvent ? undefined : card.id);

  return (
    <SeeAllListCard
      title={card.title}
      subtitle={
        isEvent
          ? card.Adress || 'Evenemang'
          : offerLabel || card.kortbeskrivning || 'Erbjudande'
      }
      meta={[distance, card.categoryName].filter(Boolean).join(' · ') || undefined}
      image={card.image}
      theme={theme}
      onPress={onPress}
      imagePriority={imagePriority}
      accentColor={
        isEvent ? theme.eventColor : getCategoryAccentForItem(card)
      }
      topLeft={
        pillLabel && pillColor ? (
          <SeeAllPill label={pillLabel} backgroundColor={pillColor} />
        ) : null
      }
      topRight={
        <SeeAllCardActions
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={() => {
            if (isEvent) {
              void shareEvent({
                title: card.title,
                subtitle: card.Adress || card.kortbeskrivning,
              });
              return;
            }
            void shareOfferFromCard(card);
          }}
          shareLabel={isEvent ? 'Dela evenemang' : 'Dela erbjudande'}
          favoriteColor={FAVORITE_HEART_COLOR}
        />
      }
    />
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
      const resolved = await getEffectiveUserCoords();
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
        const city = (await resolveUserCityFromDevice().catch(() => null))?.city;
        const results = await searchCatalog(query, {
          take: 40,
          maxHydrate: 40,
          city: city || undefined,
        });
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
        <Text
          style={{
            color: theme.text,
            fontSize: 28,
            fontWeight: '800',
            letterSpacing: -0.5,
            lineHeight: 32,
          }}
        >
          {config.title}
        </Text>
        {query ? (
          <Text className="mt-1.5 text-sm" style={{ color: theme.textMuted, lineHeight: 20 }}>
            Sökning: {query}
          </Text>
        ) : null}
        {config.subtitle ? (
          <Text
            className="mt-1 text-sm"
            style={{ color: theme.textMuted, lineHeight: 20 }}
          >
            {config.subtitle}
          </Text>
        ) : null}
      </View>
    ),
    [config.subtitle, config.title, query, theme.text, theme.textMuted]
  );

  const getBadgeLabel = useCallback(
    (card: OfferCardItem) => {
      if (card.resultKind === 'event') return 'Evenemang';
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
          keyExtractor={(item, idx) =>
            `${item.resultKind ?? 'business'}-${item.orderIds?.[0] ?? item.id}-p${pagination.page}-${idx}`
          }
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
