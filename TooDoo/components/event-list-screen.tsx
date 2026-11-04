import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import {
  EVENT_FEED_DAYS,
  fetchEventFeed,
  resolveEventFeedCity,
  type EventFeedItem,
} from '@/lib/events-feed';
import { HELSINGBORG_COORDS, resolveUserCityFromDevice } from '@/lib/geo';
import {
  getHomeEventsCacheCity,
  hasFreshHomeEventsCache,
  peekHomeEventsCache,
  setHomeEventsCache,
} from '@/lib/home-list-cache';
import { openEventFeedItem } from '@/lib/open-event-feed';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { uiTheme } from '@/lib/ui-theme';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useSeeAllFavorite } from '@/hooks/use-see-all-favorite';
import { shareBusiness, shareEvent } from '@/lib/share-offer';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';

const LIST_BATCH_SIZE = 8;

const EventCard = memo(function EventCard({
  event,
  onPress,
  theme,
  imagePriority,
}: {
  event: EventFeedItem;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  imagePriority: 'high' | 'normal';
}) {
  const { isFavorite, onFavoritePress } = useSeeAllFavorite(event.businessId);

  return (
    <SeeAllListCard
      title={event.title}
      subtitle={event.subtitle}
      meta={
        event.startsAt
          ? new Date(event.startsAt).toLocaleDateString('sv-SE', {
              timeZone: 'Europe/Stockholm',
              day: 'numeric',
              month: 'short',
            })
          : undefined
      }
      image={
        event.image ?? {
          uri: `https://picsum.photos/seed/${encodeURIComponent(event.id)}/300/200`,
        }
      }
      theme={theme}
      onPress={onPress}
      imagePriority={imagePriority}
      accentColor={theme.eventColor}
      topLeft={<SeeAllPill label="Event" backgroundColor={theme.eventColor} />}
      topRight={
        <SeeAllCardActions
          isFavorite={isFavorite}
          onFavoritePress={onFavoritePress}
          onSharePress={() => {
            if (event.businessId) {
              void shareBusiness({
                businessId: event.businessId,
                businessName: event.subtitle || event.title,
              });
              return;
            }
            void shareEvent({ title: event.title, subtitle: event.subtitle });
          }}
          shareLabel="Dela evenemang"
          favoriteColor={FAVORITE_HEART_COLOR}
        />
      }
    />
  );
});

export function EventListScreen() {
  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cached = peekHomeEventsCache();
  const hadFreshCache = hasFreshHomeEventsCache();
  const [events, setEvents] = useState<EventFeedItem[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [activeCategoryId, setActiveCategoryId] = useState(ALL_CATEGORIES_ID);
  const [activeCategoryName, setActiveCategoryName] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (refreshNonce === 0 && hadFreshCache && cached && cached.length > 0) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (!cached) {
        setIsLoading(true);
      }
      try {
        const cachedCity = getHomeEventsCacheCity();
        // Prefer the city home already resolved — don't block Visa alla on GPS.
        let city = cachedCity
          ? resolveEventFeedCity(cachedCity, HELSINGBORG_COORDS)
          : null;
        if (!city) {
          const location = await resolveUserCityFromDevice().catch(() => null);
          city = resolveEventFeedCity(
            location?.city,
            location?.coords ?? HELSINGBORG_COORDS
          );
        }
        const next = await fetchEventFeed({
          days: EVENT_FEED_DAYS,
          city,
        });
        if (!cancelled) {
          setEvents(next);
          setHomeEventsCache(next, city);
          schedulePrefetchImageUris(
            next.slice(0, 12).map((event) => event.image),
            16
          );
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
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
  }, [refreshNonce]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  useRealtimeSubscription(
    () => {
      setRefreshNonce((n) => n + 1);
    },
    { filter: (event) => event.type === 'business-event.updated' }
  );

  const handleEventPress = useCallback(
    (event: EventFeedItem) => {
      openEventFeedItem(router, event, 'evenemang');
    },
    [router]
  );

  const visibleEvents = useMemo(() => {
    if (activeCategoryId === ALL_CATEGORIES_ID && !activeCategoryName) return events;
    const want = activeCategoryName?.trim().toLocaleLowerCase('sv-SE');
    return events.filter((event) => {
      if (activeCategoryId !== ALL_CATEGORIES_ID && event.categoryId === activeCategoryId) {
        return true;
      }
      const have = event.categoryName?.trim().toLocaleLowerCase('sv-SE') ?? '';
      return Boolean(want && have === want);
    });
  }, [activeCategoryId, activeCategoryName, events]);

  const pagination = usePaginatedList(
    visibleEvents,
    `${refreshNonce}-${activeCategoryId}-${activeCategoryName ?? ''}`
  );

  usePrefetchPageImages(visibleEvents, pagination.page, SEE_ALL_PAGE_SIZE, {
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
          Evenemang
        </Text>
        <Text className="mt-1.5 text-sm" style={{ color: theme.textMuted, lineHeight: 20 }}>
          {activeCategoryName
            ? `Kommande evenemang inom ${activeCategoryName}`
            : 'Kommande aktiviteter och lokala evenemang'}
        </Text>
        <CategoryFilterBar
          selectedId={activeCategoryId}
          onSelect={(id, label) => {
            setActiveCategoryId(id);
            setActiveCategoryName(label);
          }}
        />
      </View>
    ),
    [activeCategoryId, activeCategoryName, theme.text, theme.textMuted]
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
          keyExtractor={(item) => `${item.id}-p${pagination.page}`}
          renderItem={({ item, index }) => (
            <EventCard
              event={item}
              onPress={() => handleEventPress(item)}
              theme={theme}
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
              <Text style={{ color: theme.textMuted }}>
                {activeCategoryName
                  ? `Inga evenemang i ${activeCategoryName} just nu.`
                  : 'Inga evenemang just nu.'}
              </Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
