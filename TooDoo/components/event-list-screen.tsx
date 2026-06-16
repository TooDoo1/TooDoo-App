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
  fetchEventFeed,
  type EventFeedItem,
} from '@/lib/events-feed';
import { getHomeEventsCache, setHomeEventsCache } from '@/lib/home-list-cache';
import { openEventFeedItem } from '@/lib/open-event-feed';
import { usePaginatedList, SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { schedulePrefetchImageUris, usePrefetchPageImages } from '@/lib/image-prefetch';
import { uiTheme } from '@/lib/ui-theme';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';

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
  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-2xl"
      style={{
        width: '100%',
        backgroundColor: theme.cardBg,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View className="relative h-44 w-full">
        {event.image ? (
          <CardMedia source={event.image} svgFit="fill" priority={imagePriority} />
        ) : (
          <View className="h-full w-full" style={{ backgroundColor: theme.cardBg }} />
        )}
        <View className="absolute inset-0 bg-black/20" />

        <View className="absolute left-2 top-2">
          <View
            className="rounded-full px-2 py-1"
            style={{ backgroundColor: brandInkRgba(0.75) }}
          >
            <Text className="text-[10px] font-semibold text-white">Evenemang</Text>
          </View>
        </View>

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
            {event.title}
          </Text>
          <Text className="mt-0.5 text-[11px] text-white/80" numberOfLines={1}>
            {event.subtitle}
          </Text>
        </LinearGradient>
      </View>
    </Pressable>
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
        const next = await fetchEventFeed();
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
        <View className="flex-row items-center">
          <Ionicons name="calendar-outline" size={22} color={theme.eventColor} />
          <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
            Evenemang
          </Text>
        </View>
        <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
          Kommande aktiviteter och lokala evenemang
        </Text>
      </View>
    ),
    [theme.eventColor, theme.text, theme.textMuted]
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
