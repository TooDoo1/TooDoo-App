import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { SeeAllCardActions, SeeAllListCard, SeeAllPill } from '@/components/ui/see-all-list-card';
import { hydrateOfferCardImages } from '@/lib/business-image';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  computeDiscountLabel,
  getDiscountBadgeColor,
  fetchOfferListCards,
  getEndingDateParts,
  type OfferCardItem,
} from '@/lib/home-offers';
import { formatDistanceKm, getEffectiveUserCoords } from '@/lib/geo';
import { getHomeEndingSoonCache, getHomeHotOffersCache } from '@/lib/home-list-cache';
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
  const initialCache = useMemo(
    () => (mode === 'hot' ? getHomeHotOffersCache() : getHomeEndingSoonCache()) ?? [],
    [mode]
  );

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
    let cancelled = false;

    (async () => {
      if (cards.length === 0) {
        setIsLoading(true);
      }
      try {
        const list = await fetchOfferListCards(mode, { token, coords });
        const hydrated = await hydrateOfferCardImages(list, { knownCards: list });
        if (!cancelled) {
          setCards(hydrated);
          schedulePrefetchImageUris(
            hydrated.slice(0, 12).map((card) => card.image),
            16
          );
        }
      } catch {
        if (!cancelled && cards.length === 0) setCards([]);
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
  }, [mode, token, coords, refreshNonce]);

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

  const pagination = usePaginatedList(cards, refreshNonce);

  usePrefetchPageImages(cards, pagination.page, SEE_ALL_PAGE_SIZE, { resetKey: refreshNonce });

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
        {subtitle ? (
          <Text className="mt-1.5 text-sm" style={{ color: theme.textMuted, lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    ),
    [subtitle, theme.text, theme.textMuted, title]
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
                {emptyText}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
