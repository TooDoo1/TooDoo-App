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
import { CardMedia } from '@/components/ui/card-media';
import { EventBadge } from '@/components/ui/event-badge';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  fetchBusinessEvents,
  formatEventDateRange,
  type BusinessEventItem,
} from '@/lib/business-events';
import { getHomeEventsCache, setHomeEventsCache } from '@/lib/home-list-cache';
import { openEventDetail } from '@/lib/open-event-detail';
import { uiTheme } from '@/lib/ui-theme';

const LIST_BATCH_SIZE = 8;

const EventCard = memo(function EventCard({
  event,
  onPress,
  theme,
  imagePriority,
}: {
  event: BusinessEventItem;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  imagePriority: 'high' | 'normal';
}) {
  const when = formatEventDateRange(event);

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
      {event.image ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <CardMedia source={event.image} svgFit="fill" priority={imagePriority} />
        </View>
      ) : null}
      <View className="absolute inset-0 bg-black/20" />
      <EventBadge backgroundColor={theme.primary} />
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
          {event.title}
        </Text>
        <Text className="mt-0.5 text-xs text-white/80" numberOfLines={1}>
          {event.businessName}
        </Text>
        {when ? (
          <Text className="mt-1 text-[11px] text-white/70" numberOfLines={1}>
            {when}
          </Text>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
});

export function EventListScreen() {
  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cached = getHomeEventsCache();
  const [events, setEvents] = useState<BusinessEventItem[]>(cached ?? []);
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
        const next = await fetchBusinessEvents();
        if (!cancelled) {
          setEvents(next);
          setHomeEventsCache(next);
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

  const handleEventPress = useCallback(
    (event: BusinessEventItem) => {
      openEventDetail(router, event, 'evenemang');
    },
    [router]
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <View className="flex-row items-center">
          <Ionicons name="calendar-outline" size={22} color={theme.text} />
          <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
            Evenemang
          </Text>
        </View>
        <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
          Kommande aktiviteter nära dig
        </Text>
      </View>
    ),
    [theme.text, theme.textMuted]
  );

  return (
    <WebStackSwipeContainer>
      <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
        <StackScreenTabBarSync />
        <ScreenBackButton />
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <EventCard
              event={item}
              onPress={() => handleEventPress(item)}
              theme={theme}
              imagePriority={index < 6 ? 'high' : 'normal'}
            />
          )}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
