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
import { ListItemSeparator } from '@/components/ui/list-item-separator';
import { PaginatedListFooter } from '@/components/ui/paginated-list-footer';
import { SeeAllCardActions, SeeAllListCard, SeeAllPill } from '@/components/ui/see-all-list-card';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  fetchEventFeed,
  type EventFeedItem,
} from '@/lib/events-feed';
import { resolveUserCityFromDevice } from '@/lib/geo';
import { getHomeEventsCache, setHomeEventsCache } from '@/lib/home-list-cache';
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

  const cached = getHomeEventsCache();
  const [events, setEvents] = useState<EventFeedItem[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!cached) {
        setIsLoading(true);
      }
      try {
        const location = await resolveUserCityFromDevice().catch(() => null);
        const next = await fetchEventFeed({
          city: location?.city,
        });
        if (!cancelled) {
          setEvents(next);
          setHomeEventsCache(next);
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

  const pagination = usePaginatedList(events, refreshNonce);

  usePrefetchPageImages(events, pagination.page, SEE_ALL_PAGE_SIZE, { resetKey: refreshNonce });

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
          Kommande aktiviteter och lokala evenemang
        </Text>
      </View>
    ),
    [theme.text, theme.textMuted]
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
              <Text style={{ color: theme.textMuted }}>Inga evenemang just nu.</Text>
            )
          }
        />
      </View>
    </WebStackSwipeContainer>
  );
}
