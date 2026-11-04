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
import { CategoryFilterBar } from '@/components/ui/category-filter-bar';
import { ALL_CATEGORIES_ID } from '@/lib/category-filters';
import { ListItemSeparator, SEE_ALL_COLUMN_GAP } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { SeeAllCardActions, SeeAllListCard, SeeAllPill } from '@/components/ui/see-all-list-card';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { useAuth } from '@/context/auth-context';
import {
  cardMatchesCategory,
  computeDiscountLabel,
  getDiscountBadgeColor,
  type OfferCardItem,
} from '@/lib/home-offers';
import {
  isWeekendSearchQuery,
  searchCatalog,
  sortSearchResultsForView,
  type SearchResultsView,
} from '@/lib/catalog-search';
import { resolveEventFeedCity } from '@/lib/events-feed';
import {
  applyHaversineDistances,
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getEffectiveUserCoords,
  HELSINGBORG_COORDS,
  resolveUserCityFromDevice,
} from '@/lib/geo';
import { getHomeKnownOfferCards } from '@/lib/home-list-cache';
import { openOfferDetail } from '@/lib/open-offer-detail';
import {
  fetchRecommendedNow,
  getRecommendedNowMoment,
  pickRecommendedNowCards,
} from '@/lib/recommended-now';
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
  const {
    q,
    view: viewParam,
    categoryId,
    categoryName,
    source: sourceParam,
    city: cityParam,
  } = useLocalSearchParams<{
    q?: string;
    view?: string;
    categoryId?: string;
    categoryName?: string;
    source?: string;
    city?: string;
  }>();
  const query = Array.isArray(q) ? q[0] : q ?? '';
  const viewRaw = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const initialCategoryId = Array.isArray(categoryId) ? categoryId[0] : categoryId;
  const initialCategoryName = Array.isArray(categoryName) ? categoryName[0] : categoryName;
  const sourceRaw = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;
  const isRecommendedNow = sourceRaw === 'now';
  const initialCity = Array.isArray(cityParam) ? cityParam[0] : cityParam;
  const view: SearchResultsView =
    viewRaw === 'near' || viewRaw === 'hot' ? viewRaw : 'all';
  const weekendQuery = !isRecommendedNow && isWeekendSearchQuery(query);

  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authFetch } = useAuth();

  const seededRecommended = useMemo(() => {
    if (!isRecommendedNow) return [] as OfferCardItem[];
    return pickRecommendedNowCards(getHomeKnownOfferCards(), getRecommendedNowMoment(), 20);
  }, [isRecommendedNow]);

  const [cards, setCards] = useState<OfferCardItem[]>(seededRecommended);
  const [feedTitle, setFeedTitle] = useState<string | undefined>();
  const [feedSubtitle, setFeedSubtitle] = useState<string | undefined>();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    isRecommendedNow ? HELSINGBORG_COORDS : null
  );
  const [isLoading, setIsLoading] = useState(seededRecommended.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [activeCategoryId, setActiveCategoryId] = useState(
    initialCategoryId?.trim() || ALL_CATEGORIES_ID
  );
  const [activeCategoryName, setActiveCategoryName] = useState<string | undefined>(
    initialCategoryName?.trim() || undefined
  );

  const config = isRecommendedNow
    ? {
        title: feedTitle ?? 'Rekommenderat just nu',
        icon: 'sparkles' as const,
        subtitle: feedSubtitle,
        emptyText: 'Inga förslag just nu.',
      }
    : weekendQuery
      ? {
          title: 'Helgen',
          icon: 'sunny' as const,
          subtitle: 'Evenemang och ställen',
          emptyText: 'Inga helgförslag just nu.',
        }
      : VIEW_CONFIG[view];

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
      if (cards.length === 0) setIsLoading(true);
      try {
        const categoryNameForFetch =
          activeCategoryId !== ALL_CATEGORIES_ID ? activeCategoryName : undefined;
        const effectiveCoords = coords ?? (isRecommendedNow ? HELSINGBORG_COORDS : null);
        const knownCards = getHomeKnownOfferCards();

        if (isRecommendedNow) {
          const city = resolveEventFeedCity(initialCity?.trim(), effectiveCoords);
          const feed = await fetchRecommendedNow({
            authFetch,
            city,
            coords: effectiveCoords,
            categoryName: categoryNameForFetch,
            take: 20,
            knownCards,
          });
          const results = feed?.cards?.length ? feed.cards : seededRecommended;
          const withDistance = effectiveCoords
            ? applyHaversineDistances(results, effectiveCoords)
            : results;
          if (!cancelled) {
            setFeedTitle(feed?.title);
            setFeedSubtitle(feed?.subtitle);
            setCards(withDistance);
            setIsLoading(false);
            setIsRefreshing(false);
            schedulePrefetchImageUris(
              withDistance.slice(0, 12).map((card) => card.image),
              16
            );
          }
          return;
        }

        const city =
          initialCity?.trim() ||
          (await resolveUserCityFromDevice().catch(() => null))?.city;
        const results = await searchCatalog(query, {
          take: 40,
          maxHydrate: 12,
          city: city || undefined,
          categoryName: categoryNameForFetch,
          knownCards,
        });
        const withDistance = coords ? applyHaversineDistances(results, coords) : results;
        const sorted = sortSearchResultsForView(withDistance, view, coords);
        if (!cancelled) {
          setCards(sorted);
          setIsLoading(false);
          setIsRefreshing(false);
          schedulePrefetchImageUris(
            sorted.slice(0, 12).map((card) => card.image),
            16
          );
        }
        // Soft distance fill in the background — never blocks first paint.
        if (coords && sorted.length > 0) {
          const enriched = await fillMissingDistancesFromAddresses(sorted, coords, {
            maxGeocode: 12,
          });
          if (!cancelled) {
            setCards(sortSearchResultsForView(enriched, view, coords));
          }
        }
      } catch {
        if (!cancelled) {
          if (cards.length === 0) setCards([]);
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
    // Coords upgrades must not re-run the heavy recommended/search path — distances
    // are applied separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCategoryId,
    activeCategoryName,
    authFetch,
    initialCity,
    isRecommendedNow,
    query,
    refreshNonce,
    view,
  ]);

  useEffect(() => {
    if (!coords || cards.length === 0) return;
    setCards((prev) =>
      isRecommendedNow || view !== 'near'
        ? applyHaversineDistances(prev, coords)
        : sortSearchResultsForView(applyHaversineDistances(prev, coords), view, coords)
    );
  }, [coords?.lat, coords?.lng]);

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
        {query && !weekendQuery && !isRecommendedNow ? (
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
      config.subtitle,
      config.title,
      isRecommendedNow,
      query,
      theme.text,
      theme.textMuted,
      weekendQuery,
    ]
  );

  const getBadgeLabel = useCallback(
    (card: OfferCardItem) => {
      if (card.resultKind === 'event') return 'Evenemang';
      if (view !== 'near') return undefined;
      return formatDistanceKm(card.distanceKm) ?? 'Nära dig';
    },
    [view]
  );

  const visibleCards = useMemo(() => {
    if (isRecommendedNow) return cards;
    if (activeCategoryId === ALL_CATEGORIES_ID && !activeCategoryName) return cards;
    return cards.filter((card) => {
      if (
        activeCategoryId !== ALL_CATEGORIES_ID &&
        cardMatchesCategory(card, activeCategoryId)
      ) {
        return true;
      }
      if (activeCategoryName) {
        const want = activeCategoryName.trim().toLocaleLowerCase('sv-SE');
        const have = card.categoryName?.trim().toLocaleLowerCase('sv-SE') ?? '';
        if (want && have === want) return true;
      }
      return false;
    });
  }, [activeCategoryId, activeCategoryName, cards, isRecommendedNow]);

  const pagination = usePaginatedList(
    visibleCards,
    `${refreshNonce}-${query}-${view}-${activeCategoryId}-${activeCategoryName ?? ''}`
  );

  usePrefetchPageImages(visibleCards, pagination.page, SEE_ALL_PAGE_SIZE, {
    resetKey: `${refreshNonce}-${query}-${view}-${activeCategoryId}-${activeCategoryName ?? ''}`,
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
              <View className="mt-10 items-center">
                <ActivityIndicator color={theme.text} />
              </View>
            ) : (
              <Text className="mt-10" style={{ color: theme.textMuted }}>
                {activeCategoryName
                  ? `Inga träffar i ${activeCategoryName} just nu.`
                  : config.emptyText}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
