import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageSourcePropType,
  InteractionManager,
  Platform,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  getFloatingTabBarScrollPadding,
  getTabBarLeft,
  getTabBarWidth,
} from '@/components/floating-tab-bar';
import Reanimated, {
  Easing as ReanimatedEasing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppReady } from '@/context/app-ready-context';
import { hydrateOfferCardImages } from '@/lib/business-image';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeroImageCarousel, HERO_HEIGHT } from '@/components/hero-image-carousel';
import { heroSlides } from '@/lib/hero-slides';
import { useHeroTopInset } from '@/lib/use-hero-top-inset';
import { useThemePreference } from '@/context/theme-preference-context';
import { BrandColors, brandInkRgba, FilterChipTheme } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardMedia } from '@/components/ui/card-media';
import { CompanyActivityDots } from '@/components/ui/company-activity-dots';
import {
  applyHaversineDistances,
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getUserCoords,
  haversineKm,
} from '@/lib/geo';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { useFavorites } from '@/context/favorites-context';
import { EventsPortraitRow } from '@/components/events-portrait-row';
import { fetchEventFeed, type EventFeedItem } from '@/lib/events-feed';
import { openEventFeedItem } from '@/lib/open-event-feed';
import { openOfferDetail } from '@/lib/open-offer-detail';
import {
  EVENEMANG_PATH,
  HETA_ERBJUDANDEN_PATH,
  NARA_DIG_PATH,
  SEARCH_RESULTS_PATH,
  SLUTAR_SNART_PATH,
} from '@/lib/stack-navigation';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import {
  darkenHexColor,
  getCategoryAccentColor,
  getCategoryIconName,
  getOnAccentTextColor,
  OFFERS_CATEGORY_ACCENT,
} from '@/lib/category-colors';
import {
  computeDiscountLabel,
  fetchHomeScreenData,
  getDiscountBadgeColor,
  resolveBusinessIdFromOrder,
  type OfferCardItem,
} from '@/lib/home-offers';
import {
  clearHomeSearchCache,
  getHomeEventsCache,
  getHomeScreenSnapshot,
  getHomeScrollOffset,
  getHomeSearchCache,
  hasFreshHomeScreenSnapshot,
  setHomeEndingSoonCache,
  setHomeEventsCache,
  setHomeHotOffersCache,
  setHomeNearbyBusinessesCache,
  setHomeScreenSnapshot,
  setHomeScrollOffset,
  setHomeSearchCache,
} from '@/lib/home-list-cache';
import { blurActiveElementOnWeb } from '@/lib/web-focus';
import {
  searchCatalog,
  sortSearchResultsHot,
  sortSearchResultsNearYou,
} from '@/lib/catalog-search';
import {
  DEFAULT_SEARCH_TIPS,
  fetchSearchTips,
  getLocalSearchTips,
  mergeSearchTips,
} from '@/lib/search-tips';

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';
const SEARCH_DROPDOWN_CORNER_RADIUS = 28;
const SEARCH_DROPDOWN_OPEN_MS = 220;
const SEARCH_DROPDOWN_CLOSE_MS = 240;
const SEARCH_TIPS_DEBOUNCE_MS = 80;
const SEARCH_BAR_HEIGHT = 48;
const SEARCH_DROPDOWN_MAX_HEIGHT = 268;
/** 0–1: where on the search bar the fade begins (0.5 = halfway down the bar). */
const SEARCH_DROPDOWN_DISAPPEAR_RATIO = 0.5;
const SEARCH_DROPDOWN_OPEN_EASING = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const SEARCH_DROPDOWN_CLOSE_EASING = ReanimatedEasing.bezier(0.4, 0, 0.2, 1);

type CardItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  categoryId?: string;
  categoryName?: string;
  deal?: boolean;
  orderIds?: string[];
  erbjudandepris?: number | string[];
  erbjudandeoriginalpris?: number | string[];
  Adress: string;
  latitude?: number;
  longitude?: number;
  Telefon?: string;
  Website: string;
  kortbeskrivning: string;
  långbeskrivning: string;
  erbjudande?: string | string[];
  erbjudandeclaimade?: number | string[];
  erbjudandemängd?: number | string[];
  erbjudandelängd?: string | string[];
  distanceKm?: number;
};

function sortDealsByDistance(deals: CardItem[]): CardItem[] {
  return [...deals].sort((a, b) => {
    const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return Number(b.deal) - Number(a.deal);
  });
}

function sortDealsByCoords(deals: CardItem[], coords: { lat: number; lng: number }): CardItem[] {
  return sortDealsByDistance(applyHaversineDistances(deals, coords));
}

type FilterCategory = {
  id: string;
  label: string;
};

type ApiCategory = { id?: string; _id?: string; name?: string };
type ApiBusiness = {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  city?: string;
  imageSourceType?: string;
  imageUrl?: string;
  categoryId?: string;
  categoryName?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
};
type ApiOrder = {
  id?: string;
  _id?: string;
  title?: string;
  price?: number;
  originalPrice?: number;
  imageSourceType?: string;
  imageUrl?: string;
  maxRedemptions?: number;
  claimedCount?: number;
  /** Backend canonical field for claimed redemptions. */
  claimedRedemptions?: number;
  /** Backend canonical field for redeemed redemptions. */
  redeemedRedemptions?: number;
  orderTimeFrom?: string;
  orderTimeTo?: string;
  validTo?: string;
  businessId?: string | { id?: string; _id?: string };
};

function normalizeImageUrl(raw?: unknown) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return apiUrl(trimmed);
  return apiUrl(`/${trimmed}`);
}

function parseOrdersPayload(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.orders)) return obj.orders;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function isActiveOffer(order: any, nowMs: number = Date.now()): boolean {
  if (!order) return false;

  const status = typeof order?.status === 'string' ? order.status.toUpperCase() : '';
  if (order?.isActive === false || status === 'INACTIVE' || status === 'DRAFT' || status === 'CANCELLED' || status === 'EXPIRED' || status === 'ARCHIVED') {
    return false;
  }

  // Expired (utgånget): the campaign end date has passed.
  // Use `orderTimeTo` only. `validTo` is a 1970 time-of-day value, not a real date.
  const toMs = order?.orderTimeTo ? new Date(order.orderTimeTo).getTime() : NaN;
  if (Number.isFinite(toMs) && toMs < nowMs) return false;

  // Not started yet: the campaign start date is in the future.
  const fromMs = order?.orderTimeFrom ? new Date(order.orderTimeFrom).getTime() : NaN;
  if (Number.isFinite(fromMs) && fromMs > nowMs) return false;

  // Sold out (all redemptions claimed).
  const max = Number(order?.maxRedemptions);
  const claimed = Number(order?.claimedRedemptions ?? order?.claimedCount);
  if (Number.isFinite(max) && max > 0 && Number.isFinite(claimed) && claimed >= max) {
    return false;
  }

  return true;
}

function getNearbyBadge(card: CardItem) {
  return formatDistanceKm(card.distanceKm) ?? 'Nära dig';
}

function getEndingSoonBadge(card: CardItem) {
  const raw = Array.isArray(card.erbjudandelängd) ? card.erbjudandelängd[0] : card.erbjudandelängd;
  if (!raw) return 'Snart';
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return 'Snart';
  const day = date.getDate();
  const month = date.toLocaleDateString('sv-SE', { month: 'short' }).toUpperCase();
  return `${day} ${month}`;
}

function pickAt<T>(arr: T[] | undefined, index: number): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[index] ?? arr[0];
}

function parseOrdersFromBusinessRecord(business: any): any[] {
  const nested =
    (Array.isArray(business?.activeOrders) && business.activeOrders) ||
    (Array.isArray(business?.orders) && business.orders) ||
    (Array.isArray(business?.active_orders) && business.active_orders) ||
    [];
  const businessId = business?.id ?? business?._id;
  return nested.map((order: any) => ({
    ...order,
    businessId: order?.businessId ?? businessId,
    business: order?.business ?? business,
  }));
}

function mergeOrdersById(...groups: any[][]): any[] {
  const byId = new Map<string, any>();
  groups.flat().forEach((order, index) => {
    const id = String(order?.id ?? order?._id ?? `order-${index}`);
    if (!byId.has(id)) byId.set(id, order);
  });
  return Array.from(byId.values());
}

async function fetchOrdersFromBusinessDetails(
  businesses: ApiBusiness[],
  maxBusinesses = 24
): Promise<any[]> {
  const slice = businesses.slice(0, maxBusinesses);
  const batches = await Promise.all(
    slice.map(async (business, index) => {
      const businessId = String(business.id ?? business._id ?? `business-${index}`);
      try {
        const res = await fetch(apiUrl(`/business/${encodeURIComponent(businessId)}`));
        if (!res.ok) return [];
        const json = await res.json().catch(() => ({}));
        const businessObj = (json as any)?.business ?? json;
        return parseOrdersFromBusinessRecord({ ...businessObj, id: businessId });
      } catch {
        return [];
      }
    })
  );
  return batches.flat();
}

function expandBusinessCardToOfferCards(card: CardItem): CardItem[] {
  const offers = Array.isArray(card.erbjudande)
    ? card.erbjudande
    : card.erbjudande
      ? [card.erbjudande]
      : [];
  const orderIds = card.orderIds ?? [];
  if (offers.length === 0 && orderIds.length === 0) return [];

  const count = Math.max(offers.length, orderIds.length);
  return Array.from({ length: count }, (_, i) => ({
    ...card,
    deal: true,
    orderIds: orderIds[i] ? [String(orderIds[i])] : orderIds.slice(i, i + 1).map(String),
    erbjudande: [offers[i] ?? offers[0] ?? 'Erbjudande'],
    erbjudandepris: pickAt(card.erbjudandepris as string[] | undefined, i)
      ? [String(pickAt(card.erbjudandepris as string[] | undefined, i))]
      : [],
    erbjudandeoriginalpris: pickAt(card.erbjudandeoriginalpris as string[] | undefined, i)
      ? [String(pickAt(card.erbjudandeoriginalpris as string[] | undefined, i))]
      : [],
    erbjudandeclaimade: pickAt(card.erbjudandeclaimade as string[] | undefined, i)
      ? [String(pickAt(card.erbjudandeclaimade as string[] | undefined, i))]
      : [],
    erbjudandemängd: pickAt(card.erbjudandemängd as string[] | undefined, i)
      ? [String(pickAt(card.erbjudandemängd as string[] | undefined, i))]
      : [],
    erbjudandelängd: pickAt(card.erbjudandelängd as string[] | undefined, i)
      ? [String(pickAt(card.erbjudandelängd as string[] | undefined, i))]
      : [],
    kortbeskrivning: offers[i] ?? offers[0] ?? card.kortbeskrivning,
  }));
}

function buildOfferCardsFromBusinessCards(cards: CardItem[]): CardItem[] {
  return cards.filter((card) => card.deal).flatMap(expandBusinessCardToOfferCards);
}

function applyCarouselMode(
  cards: CardItem[],
  mode: 'hot' | 'endingSoon' | 'random',
  limit = 10
): CardItem[] {
  const parseEndMs = (card: CardItem) => {
    const raw = Array.isArray(card.erbjudandelängd) ? card.erbjudandelängd[0] : card.erbjudandelängd;
    const ms = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  };

  if (mode === 'endingSoon') {
    const withEnd = cards.filter((card) => parseEndMs(card) !== Number.POSITIVE_INFINITY);
    const pool = withEnd.length > 0 ? withEnd : cards;
    return [...pool].sort((a, b) => parseEndMs(a) - parseEndMs(b)).slice(0, limit);
  }

  if (mode === 'hot') {
    return [...cards]
      .sort((a, b) => {
        const claimedA = Number(
          Array.isArray(a.erbjudandeclaimade) ? a.erbjudandeclaimade[0] : a.erbjudandeclaimade ?? 0
        );
        const claimedB = Number(
          Array.isArray(b.erbjudandeclaimade) ? b.erbjudandeclaimade[0] : b.erbjudandeclaimade ?? 0
        );
        return claimedB - claimedA;
      })
      .slice(0, limit);
  }

  if (mode === 'random') {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, limit);
  }

  return cards.slice(0, limit);
}

function resolveCarouselCards(
  catalogCards: CardItem[],
  businessOfferCards: CardItem[],
  mode: 'hot' | 'endingSoon' | 'random',
  limit = 10
): CardItem[] {
  const primary = applyCarouselMode(catalogCards, mode, limit);
  if (primary.length > 0) return primary;
  return applyCarouselMode(businessOfferCards, mode, limit);
}

function buildCatalogOfferCardsFlat(ordersRaw: any[], approvedBusinesses: ApiBusiness[]): CardItem[] {
  const businessById = new Map<string, ApiBusiness>();
  approvedBusinesses.forEach((business, index) => {
    businessById.set(String(business.id ?? business._id ?? `business-${index}`), business);
  });

  const nowMs = Date.now();
  const eligible: CardItem[] = [];

  ordersRaw.forEach((order, index) => {
    if (!isActiveOffer(order, nowMs)) return;

    const businessId =
      typeof order?.businessId === 'string'
        ? order.businessId
        : order?.businessId?.id ?? order?.businessId?._id;
    const business =
      order?.business ?? (businessId ? businessById.get(String(businessId)) : undefined);

    if (!business?.name && !business?.id && !order?.title) return;

    eligible.push(mapApiOrderToCardItem({ ...order, business: business ?? {} }, index));
  });

  return eligible;
}

function mapApiOrderToCardItem(order: any, index: number): CardItem {
  const business = order?.business ?? {};
  const orderId = String(order?.id ?? order?._id ?? `order-${index}`);
  const businessId = resolveBusinessIdFromOrder(order);

  const imageCandidate =
    order?.image?.publicUrl ??
    order?.image?.url ??
    order?.imageUrl ??
    order?.imageAsset?.publicUrl ??
    order?.imageAsset?.url ??
    business?.image?.publicUrl ??
    business?.imageUrl;

  const normalizedImageUri = normalizeImageUrl(imageCandidate);

  return {
    id: businessId ?? orderId,
    title: business?.name ?? order?.title ?? 'Erbjudande',
    image: {
      uri: normalizedImageUri ?? `https://picsum.photos/seed/${encodeURIComponent(orderId)}/300/200`,
    },
    categoryId: business?.categoryId ?? business?.category?.id,
    categoryName: business?.categoryName ?? business?.category?.name,
    deal: true,
    orderIds: [orderId],
    erbjudandepris: [String(order?.price ?? 0)],
    erbjudandeoriginalpris:
      order?.originalPrice !== undefined && order?.originalPrice !== null
        ? [String(order.originalPrice)]
        : [],
    Adress: [business?.address, business?.city].filter(Boolean).join(', ') || 'Adress saknas',
    latitude: business?.latitude,
    longitude: business?.longitude,
    Telefon: business?.contactPhone ?? undefined,
    Website: business?.website ?? '',
    kortbeskrivning: order?.title ?? order?.description ?? business?.description ?? '',
    långbeskrivning: order?.description ?? business?.description ?? '',
    erbjudande: [order?.title ?? 'Erbjudande'],
    erbjudandeclaimade: [String(order?.claimedRedemptions ?? order?.claimedCount ?? 0)],
    erbjudandemängd: [String(order?.maxRedemptions ?? 0)],
    erbjudandelängd: [order?.orderTimeTo ?? ''],
  };
}

function ForYouOrderCarousel({
  cards,
  onCardPress,
  emptyText,
  badgeLabel,
  badgeColor,
  getBadgeLabel,
  showFavoriteButton = false,
  showActivityDots = false,
  businessIdsWithEvents,
}: {
  cards: CardItem[];
  onCardPress?: (card: CardItem) => void;
  emptyText: string;
  badgeLabel: string;
  badgeColor: string;
  getBadgeLabel?: (card: CardItem) => string;
  /** Only företag (not individual erbjudanden) should be favoritable. */
  showFavoriteButton?: boolean;
  /** Event + offer dots under company cards (Nära dig). */
  showActivityDots?: boolean;
  businessIdsWithEvents?: Set<string>;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { isLoggedIn, role } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const items = cards.slice(0, 10);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <ScrollView
      horizontal
      removeClippedSubviews
      nestedScrollEnabled
      directionalLockEnabled={Platform.OS === 'ios'}
      decelerationRate={Platform.OS === 'android' ? 0.992 : 'normal'}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 2 }}
    >
      <View className="flex-row gap-3 pb-2">
        {items.map((card, idx) => (
          <Pressable
            key={`${card.orderIds?.[0] ?? card.id}-${idx}`}
            className="overflow-hidden rounded-2xl"
            style={{
              width: 168,
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.border,
            }}
            onPress={() => onCardPress?.(card)}
          >
            <View className="relative h-32 w-full">
              <CardMedia
                source={card.image}
                svgFit="fill"
                priority={idx < 4 ? 'high' : 'normal'}
                displayWidth={IMAGE_DISPLAY_WIDTH.card}
              />
              <View className="absolute inset-0 bg-black/20" />
              <View className="absolute left-2 top-2">
                <View
                  className="rounded-full px-2 py-1"
                  style={{ backgroundColor: badgeColor }}
                >
                  <Text className="text-[10px] font-semibold text-white">
                    {getBadgeLabel ? getBadgeLabel(card) : badgeLabel}
                  </Text>
                </View>
                {showActivityDots ? (
                  <CompanyActivityDots
                    hasEvent={businessIdsWithEvents?.has(card.id) ?? false}
                    hasOffer={Boolean(card.deal)}
                    eventColor={theme.eventColor}
                  />
                ) : null}
              </View>
              {showFavoriteButton && isLoggedIn && role === 'USER' ? (
                <View className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
                  <Pressable
                    onPress={async (e: any) => {
                      e?.stopPropagation?.();
                      await toggleFavorite(card.id);
                    }}
                    hitSlop={10}
                    style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons
                      name={isFavorite(card.id) ? 'heart' : 'heart-outline'}
                      size={18}
                      color={isFavorite(card.id) ? FAVORITE_HEART_COLOR : '#ffffff'}
                    />
                  </Pressable>
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
                  height: '55%',
                  paddingHorizontal: 10,
                  paddingBottom: 10,
                  justifyContent: 'flex-end',
                }}
              >
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {card.title}
                </Text>
                <Text className="mt-0.5 text-[11px] text-white/80" numberOfLines={1}>
                  {card.kortbeskrivning || 'Erbjudande'}
                </Text>
              </LinearGradient>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function getEndingDateParts(card: CardItem): { day: string; month: string } | null {
  const raw = Array.isArray(card.erbjudandelängd) ? card.erbjudandelängd[0] : card.erbjudandelängd;
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  const day = String(date.getDate());
  const month = date.toLocaleDateString('sv-SE', { month: 'short' }).toUpperCase().replace(/\./g, '');
  return { day, month };
}

function FeaturedDealCard({
  card,
  onPress,
  height,
  titleSize = 'sm',
}: {
  card: CardItem;
  onPress?: (card: CardItem) => void;
  height: number;
  titleSize?: 'sm' | 'lg';
}) {
  const discount = computeDiscountLabel(card);
  const discountColor = getDiscountBadgeColor(card);
  const offerLabel = Array.isArray(card.erbjudande) ? card.erbjudande[0] : card.erbjudande;
  return (
    <Pressable
      onPress={() => onPress?.(card)}
      className="overflow-hidden rounded-2xl"
      style={[
        { height, backgroundColor: '#000' },
        Platform.OS === 'web' ? ({ outlineWidth: 0 } as const) : null,
      ]}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <CardMedia
          source={card.image}
          svgFit="fill"
          priority="high"
          displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
        />
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
          paddingHorizontal: 12,
          paddingBottom: 12,
          paddingTop: 28,
        }}
      >
        <Text
          className={titleSize === 'lg' ? 'text-xl font-semibold text-white' : 'text-sm font-semibold text-white'}
          numberOfLines={titleSize === 'lg' ? 2 : 1}
        >
          {offerLabel || card.title}
        </Text>
        {discount ? (
          <View
            className="mt-2 self-start rounded-md px-2 py-0.5"
            style={{ backgroundColor: discountColor }}
          >
            <Text className="text-[11px] font-semibold text-white">{discount}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function FeaturedDealsSplit({
  cards,
  onCardPress,
  emptyText,
}: {
  cards: CardItem[];
  onCardPress?: (card: CardItem) => void;
  emptyText: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = cards.slice(0, 3);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  const big = items[0];
  const small1 = items[1];
  const small2 = items[2];
  const largeHeight = 220;
  const smallHeight = (largeHeight - 12) / 2;

  return (
    <View className="flex-row gap-3">
      <View style={{ flex: 1.15 }}>
        <FeaturedDealCard card={big} onPress={onCardPress} height={largeHeight} titleSize="lg" />
      </View>
      <View style={{ flex: 1, gap: 12 }}>
        {small1 ? (
          <FeaturedDealCard card={small1} onPress={onCardPress} height={smallHeight} />
        ) : null}
        {small2 ? (
          <FeaturedDealCard card={small2} onPress={onCardPress} height={smallHeight} />
        ) : (
          <View style={{ height: smallHeight }} />
        )}
      </View>
    </View>
  );
}

function EndingSoonPortraitRow({
  cards,
  onCardPress,
  emptyText,
}: {
  cards: CardItem[];
  onCardPress?: (card: CardItem) => void;
  emptyText: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = cards.slice(0, 3);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <View className="flex-row gap-3">
      {items.map((card, idx) => {
        const date = getEndingDateParts(card);
        return (
          <Pressable
            key={`${card.orderIds?.[0] ?? card.id}-${idx}`}
            onPress={() => onCardPress?.(card)}
            className="overflow-hidden rounded-2xl"
            style={{ flex: 1, height: 180, backgroundColor: '#000' }}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <CardMedia
                source={card.image}
                svgFit="fill"
                priority={idx < 4 ? 'high' : 'normal'}
                displayWidth={IMAGE_DISPLAY_WIDTH.card}
              />
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
              <Text className="text-sm font-semibold text-white" numberOfLines={2}>
                {card.title}
              </Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionTitleRow({
  title,
  icon,
  iconColor,
  subtitle,
  onSeeAllPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  subtitle?: string;
  onSeeAllPress?: () => void;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  return (
    <View className="mb-3 flex-row items-start justify-between">
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center">
          <Ionicons name={icon} size={18} color={iconColor ?? theme.text} />
          <Text className="ml-2 text-lg font-semibold" style={{ color: theme.text }}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSeeAllPress ? (
        <Pressable onPress={onSeeAllPress} className="flex-row items-center" style={{ marginTop: 2 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Visa alla</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={{ marginLeft: 2 }} />
        </Pressable>
      ) : null}
    </View>
  );
}

function isLikelyPicsumUrl(uri: string) {
  return uri.includes('picsum.photos/');
}

export default function HomeScreen() {
  const homeSnapshot = getHomeScreenSnapshot();
  const initialSearch = getHomeSearchCache();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES_ID);
  const [categoryFilters, setCategoryFilters] = useState<FilterCategory[]>(
    (homeSnapshot?.categoryFilters as FilterCategory[]) ?? []
  );
  const [deals, setDeals] = useState<CardItem[]>((homeSnapshot?.deals as CardItem[]) ?? []);
  const [nearYouCards, setNearYouCards] = useState<CardItem[]>(
    (homeSnapshot?.nearYouCards as CardItem[]) ?? []
  );
  const [hotOfferCards, setHotOfferCards] = useState<CardItem[]>(
    (homeSnapshot?.hotOfferCards as CardItem[]) ?? []
  );
  const [isLoadingData, setIsLoadingData] = useState(!homeSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialSearch.query);
  const [searchResults, setSearchResults] = useState<CardItem[]>(initialSearch.results as CardItem[]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchTips, setSearchTips] = useState<string[]>(DEFAULT_SEARCH_TIPS);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchDropdownMounted, setIsSearchDropdownMounted] = useState(false);
  const [searchBarHeight, setSearchBarHeight] = useState(SEARCH_BAR_HEIGHT);
  const [eventCards, setEventCards] = useState<EventFeedItem[]>(getHomeEventsCache() ?? []);
  const [isLoadingEvents, setIsLoadingEvents] = useState(!getHomeEventsCache());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const navBarWidth = getTabBarWidth(windowWidth, Platform.OS);
  const navBarLeft = getTabBarLeft(windowWidth, navBarWidth);
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom);
  const heroTopInset = useHeroTopInset();
  const scrollY = useRef(new Animated.Value(getHomeScrollOffset())).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(getHomeScrollOffset());
  const searchQueryRef = useRef(searchQuery);
  const searchResultsRef = useRef(searchResults);
  const knownCardsRef = useRef<CardItem[]>([]);
  const searchBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDropdownProgress = useSharedValue(0);
  const searchBarHeightSv = useSharedValue(SEARCH_BAR_HEIGHT);
  const searchDropdownHeightSv = useSharedValue(SEARCH_DROPDOWN_MAX_HEIGHT);
  searchQueryRef.current = searchQuery;
  searchResultsRef.current = searchResults;
  const router = useRouter();
  const { markDataReady } = useAppReady();
  const { token, authFetch, isLoggedIn } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const homePageBg = theme.cardBg;
  const homeHeaderPanelBg = theme.screenBg;
  const filterSurfaceStyle = FilterChipTheme.surface;
  const searchPanelBorderColor = theme.isDark ? 'rgba(255,255,255,0.10)' : brandInkRgba(0.10);

  const handleRefresh = useCallback(() => {
    invalidateCatalogCache();
    setIsRefreshing(true);
    setRefreshNonce((prev) => prev + 1);
  }, []);

  useRealtimeSubscription(
    () => {
      setRefreshNonce((prev) => prev + 1);
    },
    { enabled: Boolean(token) }
  );

  const restoreHomeScroll = useCallback(() => {
    const y = getHomeScrollOffset();
    if (y <= 0) return;
    scrollY.setValue(y);
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [scrollY]);

  useFocusEffect(
    useCallback(() => {
      blurActiveElementOnWeb();
      const task = InteractionManager.runAfterInteractions(() => {
        restoreHomeScroll();
      });

      return () => {
        task.cancel();
        setHomeScrollOffset(scrollOffsetRef.current);
        if (searchQueryRef.current.trim()) {
          setHomeSearchCache(
            searchQueryRef.current,
            searchResultsRef.current as OfferCardItem[]
          );
        }
      };
    }, [restoreHomeScroll])
  );

  useEffect(() => {
    if (!coords) return;
    setDeals((prev) => {
      if (prev.length === 0) return prev;
      return sortDealsByCoords(prev, coords);
    });
  }, [coords]);

  useEffect(() => {
    if (!coords || deals.length === 0) return;

    let cancelled = false;
    void (async () => {
      const enriched = await fillMissingDistancesFromAddresses(deals, coords, { maxGeocode: 10 });
      if (!cancelled) {
        setDeals(sortDealsByDistance(enriched));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords, deals.length, refreshNonce]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

    void fetchSearchTips({
      take: 8,
      authFetch,
      isLoggedIn,
    }).then((tips) => {
      if (!cancelled && tips.length > 0) {
        setSearchTips(tips);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authFetch, isLoggedIn]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = searchQuery.trim();
    const catalogNames = () =>
      knownCardsRef.current.map((card) => card.title).filter(Boolean);

    if (trimmed.length >= 1) {
      const instantTips = mergeSearchTips(
        getLocalSearchTips(trimmed, catalogNames(), 8),
        getLocalSearchTips(trimmed, DEFAULT_SEARCH_TIPS, 8)
      );
      if (instantTips.length > 0) {
        setSearchTips(instantTips);
      }
    }

    const timer = setTimeout(() => {
      void (async () => {
        const tips = await fetchSearchTips({
          take: 8,
          q: trimmed.length >= 1 ? trimmed : undefined,
          authFetch,
          isLoggedIn,
        });
        if (cancelled) return;

        if (trimmed.length >= 1) {
          const localTips = getLocalSearchTips(trimmed, catalogNames(), 8);
          setSearchTips(mergeSearchTips(tips, localTips));
          return;
        }

        if (tips.length > 0) {
          setSearchTips(tips);
        }
      })();
    }, trimmed.length >= 1 ? SEARCH_TIPS_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, authFetch, isLoggedIn]);

  useEffect(() => {
    return () => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
      }
    };
  }, []);

  const openSearchDropdown = useCallback(() => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    setIsSearchFocused(true);
  }, []);

  const closeSearchDropdown = useCallback(() => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
    }
    searchBlurTimerRef.current = setTimeout(() => {
      setIsSearchFocused(false);
      searchBlurTimerRef.current = null;
    }, SEARCH_DROPDOWN_CLOSE_MS);
  }, []);

  const handleSearchTipPress = useCallback((tip: string) => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    setSearchQuery(tip);
    setIsSearchFocused(true);
  }, []);

  const showSearchTipsDropdown = isSearchFocused && searchTips.length > 0;

  useEffect(() => {
    if (showSearchTipsDropdown) {
      setIsSearchDropdownMounted(true);
      searchDropdownProgress.value = withTiming(1, {
        duration: SEARCH_DROPDOWN_OPEN_MS,
        easing: SEARCH_DROPDOWN_OPEN_EASING,
      });
      return;
    }

    if (!isSearchDropdownMounted) {
      return;
    }

    searchDropdownProgress.value = withTiming(
      0,
      {
        duration: SEARCH_DROPDOWN_CLOSE_MS,
        easing: SEARCH_DROPDOWN_CLOSE_EASING,
      },
      (finished) => {
        if (finished) {
          runOnJS(setIsSearchDropdownMounted)(false);
        }
      }
    );
  }, [showSearchTipsDropdown, isSearchDropdownMounted, searchDropdownProgress]);

  const searchDropdownClipAnimatedStyle = useAnimatedStyle(() => {
    const progress = searchDropdownProgress.value;
    const barHeight = searchBarHeightSv.value;
    const disappearRatio = SEARCH_DROPDOWN_DISAPPEAR_RATIO;
    const openOffset = barHeight * (1 - disappearRatio);
    const dropdownHeight = searchDropdownHeightSv.value;
    const disappearLineY = barHeight * disappearRatio;
    const openClipHeight = openOffset + dropdownHeight;

    return {
      top: disappearLineY,
      height: progress > 0.01 ? openClipHeight : 0,
    };
  });

  const searchDropdownAnimatedStyle = useAnimatedStyle(() => {
    const progress = searchDropdownProgress.value;
    const barHeight = searchBarHeightSv.value;
    const disappearRatio = SEARCH_DROPDOWN_DISAPPEAR_RATIO;
    const openOffset = barHeight * (1 - disappearRatio);
    const dropdownHeight = searchDropdownHeightSv.value;

    return {
      opacity: interpolate(progress, [0, 0.08, disappearRatio, 1], [0, 1, 1, 1], 'clamp'),
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, disappearRatio, 1],
            [-dropdownHeight, 0, openOffset]
          ),
        },
      ],
    };
  });

  useEffect(() => {
    let cancelled = false;

    const loadHomeData = async (background = false) => {
      if (hasFreshHomeScreenSnapshot() && refreshNonce === 0 && !background) {
        markDataReady();
        setTimeout(() => {
          if (!cancelled && !hasFreshHomeScreenSnapshot(60_000)) {
            void loadHomeData(true);
          }
        }, 2000);
        return;
      }

      if (!getHomeScreenSnapshot() && !background) {
        setIsLoadingData(true);
      }
      if (!getHomeEventsCache() && !background) {
        setIsLoadingEvents(true);
      }

      try {
        const [data, events] = await Promise.all([
          fetchHomeScreenData({ token, coords }),
          fetchEventFeed({ limit: 12 }).catch(() => [] as EventFeedItem[]),
        ]);

        if (cancelled) return;

        const dealsList = data.deals;
        const nearYouFromApi = data.nearYouCards;
        const hotFromApi = data.hotOfferCards;

        setCategoryFilters(data.categoryFilters);
        setDeals(dealsList);
        setNearYouCards(nearYouFromApi);
        setHotOfferCards(hotFromApi);
        setEventCards(events);
        setHomeEventsCache(events);

        setHomeScreenSnapshot({
          categoryFilters: data.categoryFilters,
          deals: dealsList,
          nearYouCards: nearYouFromApi,
          hotOfferCards: hotFromApi,
        });

        setHomeNearbyBusinessesCache(
          dealsList.map((card) => {
            const uri =
              typeof card.image === 'object' &&
              card.image &&
              'uri' in card.image &&
              typeof card.image.uri === 'string'
                ? card.image.uri
                : '';
            return {
              id: card.id,
              title: card.title,
              image: { uri },
              Adress: card.Adress,
              kortbeskrivning: card.kortbeskrivning,
              långbeskrivning: card.långbeskrivning,
              latitude: card.latitude,
              longitude: card.longitude,
              distanceKm: card.distanceKm,
            };
          })
        );
        setHomeHotOffersCache(hotFromApi);
        setHomeEndingSoonCache(nearYouFromApi);

        schedulePrefetchImageUris(
          [
            ...dealsList.slice(0, 12).map((c) => c.image),
            ...nearYouFromApi.slice(0, 6).map((c) => c.image),
            ...hotFromApi.slice(0, 6).map((c) => c.image),
            ...events.slice(0, 6).map((event) => event.image),
          ],
          24
        );

        void (async () => {
          const hydrated = await hydrateOfferCardImages(dealsList, { knownCards: dealsList });
          if (cancelled) return;
          setDeals(hydrated);
          schedulePrefetchImageUris(hydrated.slice(0, 12).map((card) => card.image), 12);
        })();
      } catch {
        if (!cancelled) {
          setCategoryFilters([]);
          setDeals([]);
          setNearYouCards([]);
          setHotOfferCards([]);
          setEventCards([]);
          Alert.alert('Fel', 'Kunde inte ladda startsidan just nu.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
          setIsLoadingEvents(false);
          setIsRefreshing(false);
          markDataReady();
        }
      }
    };

    void loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [markDataReady, refreshNonce, token, coords?.lat, coords?.lng]);

  const filteredDeals = useMemo(() => {
    if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
      return deals;
    }

    return deals.filter((card) => card.categoryId === activeCategory);
  }, [activeCategory, deals]);

  const businessIdsWithEvents = useMemo(
    () =>
      new Set(
        eventCards
          .map((event) => event.businessId)
          .filter((businessId): businessId is string => Boolean(businessId))
      ),
    [eventCards]
  );

  const trimmedSearchQuery = searchQuery.trim();
  const isSearchActive = trimmedSearchQuery.length >= 2;
  const isSearchTooShort = trimmedSearchQuery.length === 1;

  useEffect(() => {
    knownCardsRef.current = [...deals, ...hotOfferCards, ...nearYouCards];
  }, [deals, hotOfferCards, nearYouCards]);

  const categoryOptions = useMemo<FilterCategory[]>(
    () => [
      { id: ALL_CATEGORIES_ID, label: 'Alla kategorier' },
      { id: OFFERS_CATEGORY_ID, label: 'Erbjudanden' },
      ...categoryFilters,
    ],
    [categoryFilters]
  );

  const quickCategories = useMemo(() => {
    const pool = categoryOptions.filter((cat) => cat.id !== ALL_CATEGORIES_ID);
    return pool.map((cat) => ({ ...cat, icon: getCategoryIconName(cat.label) }));
  }, [categoryOptions]);

  useEffect(() => {
    if (!categoryOptions.some((category) => category.id === activeCategory)) {
      setActiveCategory(ALL_CATEGORIES_ID);
    }
  }, [activeCategory, categoryOptions]);

  useEffect(() => {
    if (isLoadingData) return;
    if (getHomeScrollOffset() <= 0) return;
    requestAnimationFrame(() => restoreHomeScroll());
  }, [isLoadingData, restoreHomeScroll]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      clearHomeSearchCache();
      return;
    }

    const cached = getHomeSearchCache();
    setHomeSearchCache(
      searchQuery,
      cached.query === searchQuery ? cached.results : []
    );
  }, [searchQuery]);

  useEffect(() => {
    if (!trimmedSearchQuery) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    if (!isSearchActive) {
      setSearchResults([]);
      setIsSearchLoading(false);
      setHomeSearchCache(searchQuery, []);
      return;
    }

    const cached = getHomeSearchCache();
    const hasCachedResults =
      cached.query === trimmedSearchQuery && cached.results.length > 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!hasCachedResults) {
        setIsSearchLoading(true);
      }
      void searchCatalog(trimmedSearchQuery, {
        take: 16,
        maxHydrate: 12,
        knownCards: knownCardsRef.current,
      })
        .then((results) => {
          if (!cancelled) {
            const next = results as CardItem[];
            setSearchResults(next);
            setHomeSearchCache(trimmedSearchQuery, next as OfferCardItem[]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
            setHomeSearchCache(trimmedSearchQuery, []);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearchLoading(false);
          }
        });
    }, hasCachedResults ? 0 : 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSearchActive, searchQuery, trimmedSearchQuery]);

  useEffect(() => {
    if (!coords || !isSearchActive || searchResults.length === 0) return;

    let cancelled = false;
    void (async () => {
      const enriched = await fillMissingDistancesFromAddresses(searchResults, coords, {
        maxGeocode: 20,
      });
      if (!cancelled) {
        setSearchResults(enriched);
        setHomeSearchCache(trimmedSearchQuery, enriched as OfferCardItem[]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords, isSearchActive, trimmedSearchQuery, searchResults.length]);

  const searchedNearYou = useMemo(
    () => sortSearchResultsNearYou(searchResults, coords),
    [coords, searchResults]
  );

  const searchedHot = useMemo(() => sortSearchResultsHot(searchResults), [searchResults]);

  const handleCardPress = (card: CardItem) => {
    setHomeScrollOffset(scrollOffsetRef.current);
    setHomeSearchCache(trimmedSearchQuery, searchResults as OfferCardItem[]);
    openOfferDetail(router, card, 'index');
  };

  const handleEventPress = (event: EventFeedItem) => {
    setHomeScrollOffset(scrollOffsetRef.current);
    openEventFeedItem(router, event, 'index');
  };

  const openSearchResultsView = useCallback(
    (view: 'all' | 'near' | 'hot') => {
      if (!trimmedSearchQuery) return;
      setHomeSearchCache(trimmedSearchQuery, searchResults as OfferCardItem[]);
      router.push({
        pathname: SEARCH_RESULTS_PATH,
        params: { q: trimmedSearchQuery, view },
      });
    },
    [router, searchResults, trimmedSearchQuery]
  );

  const heroBlockHeight = HERO_HEIGHT + heroTopInset;
  const searchPanelStickyLift = 12;
  // Keep collapse shorter than hero height — 1:1 mapping breaks ScrollView layout.
  const heroCollapseScroll = 200;
  const collapsedHeaderTopPadding = heroTopInset + 8 - searchPanelStickyLift;
  const heroHeight = scrollY.interpolate({
    inputRange: [0, heroCollapseScroll],
    outputRange: [heroBlockHeight, 0],
    extrapolate: 'clamp',
  });
  const headerTopPadding = scrollY.interpolate({
    inputRange: [0, heroCollapseScroll],
    outputRange: [8, collapsedHeaderTopPadding],
    extrapolate: 'clamp',
  });
  const webStickyTopPadding = scrollY.interpolate({
    inputRange: [0, heroBlockHeight],
    outputRange: [16, heroTopInset + 16 - searchPanelStickyLift],
    extrapolate: 'clamp',
  });
  const searchDropdownExpanded = showSearchTipsDropdown || isSearchDropdownMounted;
  const searchDropdownDividerColor = 'rgba(0, 0, 0, 0.08)';

  const searchPanelStyle = {
    backgroundColor: homeHeaderPanelBg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: searchPanelBorderColor,
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky' as const,
          top: 0,
          zIndex: searchDropdownExpanded ? 200 : 20,
          overflow: 'visible' as const,
          width: '100%' as const,
          alignSelf: 'stretch' as const,
        } as const)
      : ({
          zIndex: searchDropdownExpanded ? 200 : 10,
          elevation: searchDropdownExpanded ? 200 : 10,
          overflow: 'visible' as const,
        } as const)),
  };

  const renderSearchTipsDropdown = () =>
    isSearchDropdownMounted && searchTips.length > 0 ? (
      <Reanimated.View
        pointerEvents="box-none"
        style={[
          searchDropdownClipAnimatedStyle,
          {
            position: 'absolute',
            left: 0,
            width: '100%',
            zIndex: 1,
            elevation: 1,
            overflow: 'hidden',
          },
        ]}
      >
        <Reanimated.View
          className="w-full overflow-hidden"
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight > 0) {
              searchDropdownHeightSv.value = measuredHeight;
            }
          }}
          style={[
            filterSurfaceStyle,
            searchDropdownAnimatedStyle,
            {
              width: '100%',
              borderRadius: SEARCH_DROPDOWN_CORNER_RADIUS,
              ...(Platform.OS === 'web'
                ? {
                    boxShadow: '0 12px 28px rgba(0,0,0,0.14)',
                  }
                : {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.12,
                    shadowRadius: 14,
                    elevation: 1,
                  }),
            },
          ]}
        >
          <View
            className="px-4 py-2.5"
            style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: searchDropdownDividerColor }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: FilterChipTheme.textMuted }}
            >
              {searchQuery.trim() ? 'Förslag' : 'Söktips'}
            </Text>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={{ maxHeight: 220 }}
            showsVerticalScrollIndicator={false}
          >
            {searchTips.map((tip, index) => (
              <Pressable
                key={tip}
                onPress={() => handleSearchTipPress(tip)}
                className="flex-row items-center px-4 py-3"
                style={
                  index < searchTips.length - 1
                    ? {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: searchDropdownDividerColor,
                      }
                    : undefined
                }
              >
                <Ionicons
                  name={searchQuery.trim() ? 'business-outline' : 'bulb-outline'}
                  size={18}
                  color={FilterChipTheme.textMuted}
                  style={{ marginRight: 12 }}
                />
                <Text className="flex-1 text-base" style={{ color: FilterChipTheme.text }}>
                  {tip}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={FilterChipTheme.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </Reanimated.View>
      </Reanimated.View>
    ) : null;

  const renderHomeSearchHeader = () => (
  <View style={styles.searchHeaderRoot} pointerEvents="box-none">
      <View
        style={[
          styles.searchBarAnchor,
          Platform.OS === 'web'
            ? styles.searchBarAnchorWeb
            : {
                marginLeft: navBarLeft,
                width: navBarWidth,
              },
          {
            zIndex: searchDropdownExpanded ? 100 : 0,
            elevation: searchDropdownExpanded ? 100 : 0,
          },
        ]}
      >
        {renderSearchTipsDropdown()}

        <View
          style={[
            filterSurfaceStyle,
            styles.searchBarRow,
            {
              height: SEARCH_BAR_HEIGHT,
              position: 'relative',
              zIndex: 2,
              elevation: 2,
            },
          ]}
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight > 0) {
              searchBarHeightSv.value = measuredHeight;
              setSearchBarHeight(measuredHeight);
            }
          }}
        >
          <Ionicons name="search" size={18} color={FilterChipTheme.textMuted} style={styles.searchBarIcon} />
          <View style={styles.searchBarInputSlot}>
            <TextInput
              nativeID="home-search-input"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={openSearchDropdown}
              onBlur={closeSearchDropdown}
              placeholder="Sök restauranger, events, upplevelser"
              placeholderTextColor={FilterChipTheme.placeholder}
              style={[
                styles.searchBarInput,
                {
                  color: FilterChipTheme.text,
                  height: SEARCH_BAR_HEIGHT,
                },
              ]}
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={() => {
              setSearchQuery('');
              clearHomeSearchCache();
            }}
            style={[
              styles.searchBarClearButton,
              { opacity: searchQuery.trim() ? 1 : 0 },
            ]}
            pointerEvents={searchQuery.trim() ? 'auto' : 'none'}
            disabled={!searchQuery.trim()}
            accessibilityElementsHidden={!searchQuery.trim()}
            importantForAccessibility={searchQuery.trim() ? 'auto' : 'no-hide-descendants'}
          >
            <Ionicons name="close-circle" size={18} color={FilterChipTheme.textMuted} />
          </Pressable>
        </View>
      </View>

      <View className="mt-4" style={{ zIndex: 1, elevation: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
          <View className="flex-row gap-2">
            {quickCategories.map((cat) => (
              (() => {
                const isOffersCategory = cat.id === OFFERS_CATEGORY_ID;
                const isSelected = activeCategory === cat.id;
                const baseAccent = isOffersCategory
                  ? OFFERS_CATEGORY_ACCENT
                  : getCategoryAccentColor(cat.label);
                const isHighlighted = isOffersCategory || isSelected;
                const chipColor = isOffersCategory
                  ? isSelected
                    ? darkenHexColor(baseAccent)
                    : baseAccent
                  : baseAccent;
                const chipTextColor = getOnAccentTextColor(chipColor);

                return (
              <Pressable
                key={cat.id}
                onPress={() =>
                  setActiveCategory((prev) => (prev === cat.id ? ALL_CATEGORIES_ID : cat.id))
                }
                className="flex-row items-center rounded-full px-3 py-2"
                style={
                  isHighlighted
                    ? { backgroundColor: chipColor, borderColor: chipColor, borderWidth: 1 }
                    : filterSurfaceStyle
                }
              >
                <Ionicons
                  name={cat.icon}
                  size={14}
                  color={isHighlighted ? chipTextColor : FilterChipTheme.textMuted}
                />
                <Text
                  className="ml-2 text-xs"
                  style={{ color: isHighlighted ? chipTextColor : FilterChipTheme.textMuted }}
                >
                  {cat.label}
                </Text>
              </Pressable>
                );
              })()
            ))}
          </View>
        </ScrollView>
      </View>
  </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: homeHeaderPanelBg }}>
      <View className="flex-1" style={[styles.screen, { backgroundColor: 'transparent' }]}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: scrollBottomPadding }}
          stickyHeaderIndices={Platform.OS === 'web' ? undefined : [1]}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: false,
              listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
                scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              },
            }
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressViewOffset={0}
            />
          }
        >
        <View style={{ backgroundColor: homeHeaderPanelBg }}>
          {Platform.OS === 'web' ? (
            <View style={{ height: heroBlockHeight, overflow: 'hidden' }}>
              <HeroImageCarousel
                slides={heroSlides}
                panelBackgroundColor={homeHeaderPanelBg}
                topInset={heroTopInset}
              />
            </View>
          ) : (
            <Animated.View style={{ height: heroHeight, overflow: 'hidden' }}>
              <HeroImageCarousel
                slides={heroSlides}
                panelBackgroundColor={homeHeaderPanelBg}
                topInset={heroTopInset}
              />
            </Animated.View>
          )}
        </View>

        <View style={searchPanelStyle} pointerEvents="box-none">
          {Platform.OS === 'web' ? (
            <Animated.View
              pointerEvents="box-none"
              style={{
                paddingTop: webStickyTopPadding,
                paddingBottom: 10,
                backgroundColor: homeHeaderPanelBg,
              }}
            >
              {renderHomeSearchHeader()}
            </Animated.View>
          ) : (
            <Animated.View
              pointerEvents="box-none"
              style={{
                paddingTop: headerTopPadding,
                paddingBottom: 10,
                backgroundColor: homeHeaderPanelBg,
              }}
            >
              {renderHomeSearchHeader()}
            </Animated.View>
          )}
        </View>

        <View className="mt-6 px-6">
          {isSearchActive || isSearchTooShort ? (
            <>
              <SectionTitleRow
                title="Sökresultat"
                icon="search"
                iconColor={OFFERS_CATEGORY_ACCENT}
                onSeeAllPress={() => openSearchResultsView('all')}
              />
              {isSearchTooShort ? (
                <Text style={{ color: theme.textMuted }}>Skriv minst 2 tecken för att söka.</Text>
              ) : isSearchLoading ? (
                <Text style={{ color: theme.textMuted }}>Söker...</Text>
              ) : (
                <>
                  <ForYouOrderCarousel
                    cards={searchResults}
                    onCardPress={handleCardPress}
                    badgeLabel="Träff"
                    badgeColor={brandInkRgba(0.75)}
                    showFavoriteButton
                    emptyText={`Inga träffar för "${trimmedSearchQuery}".`}
                  />

                  {searchResults.length > 0 ? (
                    <>
                      <View className="mt-6">
                        <SectionTitleRow
                          title="Nära dig"
                          icon="navigate"
                          iconColor={OFFERS_CATEGORY_ACCENT}
                          onSeeAllPress={() => openSearchResultsView('near')}
                        />
                        <ForYouOrderCarousel
                          cards={searchedNearYou}
                          onCardPress={handleCardPress}
                          badgeLabel="Nära dig"
                          badgeColor={brandInkRgba(0.75)}
                          getBadgeLabel={getNearbyBadge}
                          showFavoriteButton
                          showActivityDots
                          businessIdsWithEvents={businessIdsWithEvents}
                          emptyText={`Inga träffar nära dig för "${trimmedSearchQuery}".`}
                        />
                      </View>

                      <View className="mt-6">
                        <SectionTitleRow
                          title="Heta erbjudanden"
                          icon="flame"
                          iconColor={OFFERS_CATEGORY_ACCENT}
                          subtitle="Baserat på din sökning"
                          onSeeAllPress={() => openSearchResultsView('hot')}
                        />
                        <FeaturedDealsSplit
                          cards={searchedHot}
                          onCardPress={handleCardPress}
                          emptyText={`Inga heta erbjudanden för "${trimmedSearchQuery}".`}
                        />
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <SectionTitleRow
                title="Nära dig"
                icon="navigate"
                iconColor={OFFERS_CATEGORY_ACCENT}
                onSeeAllPress={() => router.push(NARA_DIG_PATH)}
              />
              {isLoadingData && filteredDeals.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>Laddar...</Text>
              ) : (
                <ForYouOrderCarousel
                  cards={filteredDeals}
                  onCardPress={handleCardPress}
                  badgeLabel="Nära dig"
                  badgeColor={brandInkRgba(0.75)}
                  getBadgeLabel={getNearbyBadge}
                  showFavoriteButton
                  showActivityDots
                  businessIdsWithEvents={businessIdsWithEvents}
                  emptyText="Inga erbjudanden nära dig just nu."
                />
              )}

              <View className="mt-6">
                <SectionTitleRow
                  title="Heta erbjudanden"
                  icon="flame"
                  iconColor={OFFERS_CATEGORY_ACCENT}
                  subtitle="Baserat på dina intressen"
                  onSeeAllPress={() => router.push(HETA_ERBJUDANDEN_PATH)}
                />
                {isLoadingData && hotOfferCards.length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>Laddar...</Text>
                ) : (
                  <FeaturedDealsSplit
                    cards={hotOfferCards}
                    onCardPress={handleCardPress}
                    emptyText="Inga heta erbjudanden just nu."
                  />
                )}
              </View>

              <View className="mt-6">
                <SectionTitleRow
                  title="Slutar snart"
                  icon="hourglass-outline"
                  subtitle="Baserat på dina intressen"
                  onSeeAllPress={() => router.push(SLUTAR_SNART_PATH)}
                />
                {isLoadingData && nearYouCards.length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>Laddar...</Text>
                ) : (
                  <EndingSoonPortraitRow
                    cards={nearYouCards}
                    onCardPress={handleCardPress}
                    emptyText="Inga tidsbegränsade erbjudanden just nu."
                  />
                )}
              </View>

              <View className="mt-6">
                <SectionTitleRow
                  title="Evenemang"
                  icon="calendar-outline"
                  iconColor={theme.eventColor}
                  subtitle="Kommande aktiviteter"
                  onSeeAllPress={() => router.push(EVENEMANG_PATH)}
                />
                {isLoadingEvents && eventCards.length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>Laddar...</Text>
                ) : (
                  <EventsPortraitRow
                    events={eventCards}
                    onEventPress={handleEventPress}
                    emptyText="Inga evenemang just nu."
                  />
                )}
              </View>
            </>
          )}
        </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  searchHeaderRoot: {
    position: 'relative',
    width: '100%',
  },
  searchBarAnchor: {
    position: 'relative',
    maxWidth: '100%',
  },
  searchBarAnchorWeb: {
    width: '100%',
    paddingHorizontal: 24,
    marginLeft: 0,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  searchBarIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  searchBarInputSlot: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  searchBarInput: {
    width: '100%',
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 20,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none' as const,
      },
      default: {},
    }),
  },
  searchBarClearButton: {
    marginLeft: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
});
