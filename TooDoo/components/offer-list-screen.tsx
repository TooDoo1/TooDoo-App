import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { hydrateOfferCardImages } from '@/lib/business-image';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  cardMatchesCategory,
  computeDiscountLabel,
  getDiscountBadgeColor,
  fetchOfferListCards,
  getEndingDateParts,
  type OfferCardItem,
} from '@/lib/home-offers';
import { resolveEventFeedCity } from '@/lib/events-feed';
import { applyHaversineDistances, formatDistanceKm, getEffectiveUserCoords } from '@/lib/geo';
import {
  getHomeEventsCacheCity,
  hasFreshHomeEndingSoonCache,
  hasFreshHomeHotOffersCache,
  peekHomeEndingSoonCache,
  peekHomeHotOffersCache,
  setHomeEndingSoonCache,
  setHomeHotOffersCache,
} from '@/lib/home-list-cache';
import { openOfferDetail } from '@/lib/open-offer-detail';
import { shareOfferFromCard } from '@/lib/share-offer';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { uiTheme } from '@/lib/ui-theme';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useSeeAllFavorite } from '@/hooks/use-see-all-favorite';
import { useAuth } from '@/context/auth-context';
import { getCategoryAccentForItem } from '@/lib/category-colors';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';

type OfferListMode = 'hot' | 'endingSoon';

type OfferListScreenProps = {
  mode: OfferListMode;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  subtitle?: string;
  emptyText: string;
};

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const LIST_BATCH_SIZE = 8;

const OfferSeeAllCard = memo(function OfferSeeAllCard({
  card,
  mode,
  onPress,
  theme,
  imagePriority,
}: {
  card: OfferCardItem;
  mode: OfferListMode;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  imagePriority: 'high' | 'normal';
}) {
  const discount = computeDiscountLabel(card);
  const discountColor = getDiscountBadgeColor(card);
  const offerLabel = Array.isArray(card.erbjudande) ? card.erbjudande[0] : card.erbjudande;
  const distance = formatDistanceKm(card.distanceKm);
  const ending = mode === 'endingSoon' ? getEndingDateParts(card) : null;
  const badgeLabel = ending
    ? `${ending.day} ${ending.month}`
    : discount ?? undefined;
  const badgeColor = ending ? 'rgba(0,0,0,0.55)' : discountColor;
  const { isFavorite, onFavoritePress } = useSeeAllFavorite(card.id);

  return (
    <SeeAllListCard
      title={card.title}
      subtitle={offerLabel || card.kortbeskrivning || 'Erbjudande'}
      meta={[distance, card.categoryName].filter(Boolean).join(' · ') || undefined}
      image={card.image}
      theme={theme}
      onPress={onPress}
      imagePriority={imagePriority}
      accentColor={getCategoryAccentForItem(card)}
      topLeft={
        badgeLabel ? <SeeAllPill label={badgeLabel} backgroundColor={badgeColor} /> : null
      }
      topRight={
        <SeeAllCardActions
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={() => void shareOfferFromCard(card)}
          shareLabel="Dela erbjudande"
          favoriteColor={FAVORITE_HEART_COLOR}
        />
      }
    />
  );
});

export function OfferListScreen({
  mode,
  title,
  subtitle,
  emptyText,
}: OfferListScreenProps) {
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
  const hasCategoryFilter =
    activeCategoryId !== ALL_CATEGORIES_ID && Boolean(activeCategoryId || activeCategoryName);
  const listSubtitle = hasCategoryFilter
    ? mode === 'hot'
      ? `Populärt inom ${activeCategoryName}`
      : `Inom ${activeCategoryName}`
    : subtitle;
  const listEmptyText = hasCategoryFilter
    ? `Inga träffar i ${activeCategoryName} just nu.`
    : emptyText;

  const initialCache = useMemo(
    () => (mode === 'hot' ? peekHomeHotOffersCache() : peekHomeEndingSoonCache()) ?? [],
    [mode]
  );
  const hadFreshCache =
    mode === 'hot' ? hasFreshHomeHotOffersCache() : hasFreshHomeEndingSoonCache();

  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [cards, setCards] = useState<OfferCardItem[]>(initialCache);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(initialCache.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await getEffectiveUserCoords();
      if (!cancelled && resolved) setCoords(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coords || cards.length === 0) return;
    setCards((prev) => applyHaversineDistances(prev, coords));
  }, [coords?.lat, coords?.lng]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Home already warmed this list — skip a network round-trip until pull-to-refresh.
      if (refreshNonce === 0 && hadFreshCache && initialCache.length > 0) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (cards.length === 0) {
        setIsLoading(true);
      }
      try {
        const city = resolveEventFeedCity(getHomeEventsCacheCity(), coords);
        const list = await fetchOfferListCards(mode, {
          token,
          coords,
          city,
          limit: 50,
        });
        if (!cancelled) {
          setCards(list);
          if (mode === 'hot') setHomeHotOffersCache(list);
          else setHomeEndingSoonCache(list);
          setIsLoading(false);
          setIsRefreshing(false);
          schedulePrefetchImageUris(
            list.slice(0, 12).map((card) => card.image),
            16
          );
        }
        // Image hydration is non-blocking — don't hold the list spinner for it.
        const hydrated = await hydrateOfferCardImages(list, {
          knownCards: [...initialCache, ...list],
        });
        if (!cancelled) {
          setCards(hydrated);
          if (mode === 'hot') setHomeHotOffersCache(hydrated);
          else setHomeEndingSoonCache(hydrated);
        }
      } catch {
        if (!cancelled && cards.length === 0) setCards([]);
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, token, refreshNonce]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  useRealtimeSubscription(
    () => {
      setRefreshNonce((n) => n + 1);
    },
    {
      enabled: Boolean(token),
      filter: (event) => event.type === 'order.updated',
    }
  );

  const handleCardPress = useCallback(
    (card: OfferCardItem) => {
      openOfferDetail(router, card, mode === 'hot' ? 'heta' : 'slutarsnart');
    },
    [router, mode]
  );

  const visibleCards = useMemo(() => {
    if (!hasCategoryFilter) return cards;
    return cards.filter((card) => {
      if (activeCategoryId && activeCategoryId !== ALL_CATEGORIES_ID && cardMatchesCategory(card, activeCategoryId)) {
        return true;
      }
      if (activeCategoryName) {
        const want = activeCategoryName.trim().toLocaleLowerCase('sv-SE');
        const have = card.categoryName?.trim().toLocaleLowerCase('sv-SE') ?? '';
        if (want && have === want) return true;
      }
      return false;
    });
  }, [activeCategoryId, activeCategoryName, cards, hasCategoryFilter]);

  const pagination = usePaginatedList(
    visibleCards,
    `${refreshNonce}-${activeCategoryId}-${activeCategoryName ?? ''}`
  );

  usePrefetchPageImages(visibleCards, pagination.page, SEE_ALL_PAGE_SIZE, {
    resetKey: `${refreshNonce}-${activeCategoryId}-${activeCategoryName ?? ''}`,
  });

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
          {title}
        </Text>
        {listSubtitle ? (
          <Text className="mt-1.5 text-sm" style={{ color: theme.textMuted, lineHeight: 20 }}>
            {listSubtitle}
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
    [activeCategoryId, listSubtitle, theme.text, theme.textMuted, title]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: OfferCardItem; index: number }) => {
      const onPress = () => handleCardPress(item);
      const imagePriority = index < 6 ? 'high' : 'normal';

      return (
        <OfferSeeAllCard
          card={item}
          mode={mode}
          onPress={onPress}
          theme={theme}
          imagePriority={imagePriority}
        />
      );
    },
    [handleCardPress, mode, theme]
  );

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
          keyExtractor={(item, idx) => `${item.orderIds?.[0] ?? item.id}-${pagination.page}-${idx}`}
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
              <View className="mt-10 items-center">
                <ActivityIndicator color={theme.text} />
              </View>
            ) : (
              <Text className="mt-10" style={{ color: theme.textMuted }}>
                {listEmptyText}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
