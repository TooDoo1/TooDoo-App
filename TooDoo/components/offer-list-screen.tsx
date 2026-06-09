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

import { BrandColors } from '@/lib/brand-colors';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { CardMedia } from '@/components/ui/card-media';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  computeDiscountLabel,
  getDiscountBadgeColor,
  fetchOfferListCards,
  getEndingDateParts,
  type OfferCardItem,
} from '@/lib/home-offers';
import { getUserCoords } from '@/lib/geo';
import { getHomeEndingSoonCache, getHomeHotOffersCache } from '@/lib/home-list-cache';
import { openOfferDetail } from '@/lib/open-offer-detail';
import { uiTheme } from '@/lib/ui-theme';

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

const HotOfferCard = memo(function HotOfferCard({
  card,
  onPress,
  theme,
  imagePriority,
}: {
  card: OfferCardItem;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  imagePriority: 'high' | 'normal';
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
        <CardMedia source={card.image} svgFit="fill" priority={imagePriority} />
      </View>
      <View className="absolute inset-0 bg-black/20" />
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
});

const EndingSoonOfferCard = memo(function EndingSoonOfferCard({
  card,
  onPress,
  theme,
  imagePriority,
}: {
  card: OfferCardItem;
  onPress: () => void;
  theme: ReturnType<typeof uiTheme>;
  imagePriority: 'high' | 'normal';
}) {
  const date = getEndingDateParts(card);

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
        <CardMedia source={card.image} svgFit="fill" priority={imagePriority} />
      </View>
      <View className="absolute inset-0 bg-black/25" />
      {date ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            minWidth: 36,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: BrandColors.dark.secondary, lineHeight: 16 }}>
            {date.day}
          </Text>
          <Text style={{ fontSize: 9, fontWeight: '700', color: BrandColors.dark.secondary, lineHeight: 11 }}>
            {date.month}
          </Text>
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
          paddingHorizontal: 10,
          paddingBottom: 10,
          paddingTop: 24,
        }}
      >
        <Text className="text-base font-semibold text-white" numberOfLines={2}>
          {card.title}
        </Text>
        <Text className="mt-0.5 text-xs text-white/80" numberOfLines={1}>
          {card.kortbeskrivning || 'Erbjudande'}
        </Text>
      </LinearGradient>
    </Pressable>
  );
});

export function OfferListScreen({
  mode,
  title,
  icon,
  iconColor,
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
      const resolved = await getUserCoords();
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
        if (!cancelled) setCards(list);
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

  const handleCardPress = useCallback(
    (card: OfferCardItem) => {
      openOfferDetail(router, card, mode === 'hot' ? 'heta' : 'slutarsnart');
    },
    [router, mode]
  );

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <View className="flex-row items-center">
          <Ionicons name={icon} size={22} color={iconColor ?? theme.text} />
          <Text className="ml-2 text-2xl font-semibold" style={{ color: theme.text }}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    ),
    [icon, iconColor, subtitle, theme.text, theme.textMuted, title]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: OfferCardItem; index: number }) => {
      const onPress = () => handleCardPress(item);
      const imagePriority = index < 6 ? 'high' : 'normal';

      if (mode === 'hot') {
        return <HotOfferCard card={item} onPress={onPress} theme={theme} imagePriority={imagePriority} />;
      }
      return <EndingSoonOfferCard card={item} onPress={onPress} theme={theme} imagePriority={imagePriority} />;
    },
    [handleCardPress, mode, theme]
  );

  return (
    <WebStackSwipeContainer>
      <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
        <StackScreenTabBarSync />
        <ScreenBackButton />
        <FlatList
          data={cards}
          keyExtractor={(item, idx) => `${item.orderIds?.[0] ?? item.id}-${idx}`}
          renderItem={renderItem}
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
