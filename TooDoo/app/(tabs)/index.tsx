import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
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
import { HeroMicButton } from '@/components/hero-mic-button';
import { heroSlides } from '@/lib/hero-slides';
import { useHeroTopInset } from '@/lib/use-hero-top-inset';
import { useThemePreference } from '@/context/theme-preference-context';
import { BrandColors, brandInkRgba, FilterChipTheme } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardMedia } from '@/components/ui/card-media';
import { CompanyActivityDots } from '@/components/ui/company-activity-dots';
import {
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getUserCoords,
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
  cardMatchesCategory,
  computeDiscountLabel,
  fetchHomeScreenData,
  getDiscountBadgeColor,
  resolveBusinessCategoryIds,
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
  searchNatural,
  sortSearchResultsHot,
  sortSearchResultsNearYou,
} from '@/lib/catalog-search';
import {
  getSpeechSupportInfo,
  startSpeechToText,
  type SpeechToTextSession,
} from '@/lib/speech-to-text';
import { playMicCue } from '@/lib/mic-cues';
import { showAlert } from '@/lib/show-alert';
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
const SEARCH_PANEL_BOTTOM_RADIUS = 12;
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
  categoryIds?: string[];
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

function filterCardsByActiveCategory(cards: CardItem[], activeCategory: string): CardItem[] {
  if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
    return cards;
  }

  return cards.filter((card) => cardMatchesCategory(card, activeCategory));
}

function sortDealsByDistance(deals: CardItem[]): CardItem[] {
  return [...deals].sort((a, b) => {
    const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return Number(b.deal) - Number(a.deal);
  });
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
  categories?: Array<{ id?: string; _id?: string; name?: string } | string>;
  categoryIds?: string[];
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
    const catalogBusiness = businessId ? businessById.get(String(businessId)) : undefined;
    const nestedBusiness = order?.business;
    const business =
      nestedBusiness || catalogBusiness
        ? {
            ...(catalogBusiness ?? {}),
            ...(nestedBusiness ?? {}),
            categories: nestedBusiness?.categories ?? catalogBusiness?.categories,
            categoryIds: nestedBusiness?.categoryIds ?? catalogBusiness?.categoryIds,
          }
        : undefined;

    if (!business?.name && !business?.id && !order?.title) return;

    eligible.push(mapApiOrderToCardItem({ ...order, business: business ?? {} }, index));
  });

  return eligible;
}

function mapApiOrderToCardItem(order: any, index: number): CardItem {
  const business = order?.business ?? {};
  const orderId = String(order?.id ?? order?._id ?? `order-${index}`);
  const businessId = resolveBusinessIdFromOrder(order);
  const categoryIds = resolveBusinessCategoryIds(business);

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
    categoryId: categoryIds[0] ?? business?.categoryId ?? business?.category?.id,
    categoryIds,
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

const POPULAR_VISIBLE = 3;
const POPULAR_ROTATE_MS = 6000;
const POPULAR_MOVE_MS = 750;

type Rect = { x: number; y: number; w: number; h: number };

// A deal card that fills its (animated) parent instead of using a fixed height,
// so it can be smoothly resized as it moves between slots.
function FillCard({
  card,
  onPress,
  titleSize = 'sm',
}: {
  card: CardItem;
  onPress?: (card: CardItem) => void;
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
        { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000' },
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
          <View className="mt-2 self-start rounded-md px-2 py-0.5" style={{ backgroundColor: discountColor }}>
            <Text className="text-[11px] font-semibold text-white">{discount}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

type AnimRect = { x: Animated.Value; y: Animated.Value; w: Animated.Value; h: Animated.Value };
type LiveCard = { card: CardItem; titleSize: 'sm' | 'lg' };

// Same split layout as FeaturedDealsSplit, but rotates through the full list one
// card at a time, like a queue. On each tick the cards physically move (no fade):
// the big card slides out to the left, the top-right small glides into the big
// slot and grows to fill it, the bottom-right rises into the top-right slot, and
// a single new card slides up into the bottom-right slot.
//
// Cards are kept mounted and keyed by id across ticks (each owns a persistent
// animated rect), and the upcoming card is pre-mounted just below the viewport,
// so nothing remounts or re-decodes its image mid-animation -> no start hitch.
function AnimatedFeaturedDeals({
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

  const largeHeight = 220;
  const smallHeight = (largeHeight - 12) / 2;
  const columnGap = 12;

  const [containerW, setContainerW] = useState(0);
  const [start, setStart] = useState(0);
  const [live, setLive] = useState<LiveCard[]>([]);

  // Persistent animated rect per card id (survives across ticks; no remount).
  const rectsRef = useRef(new Map<string, AnimRect>());
  const prevStartRef = useRef<number | null>(null);
  const prevCardsRef = useRef<CardItem[] | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Geometry of the three slots (and the off-screen enter/exit rects).
  const geo = useMemo(() => {
    if (containerW <= 0) return null;
    const rem = containerW - columnGap;
    const bigW = (rem * 1.15) / 2.15;
    const rightW = rem - bigW;
    const rightX = bigW + columnGap;
    const bottomY = smallHeight + columnGap;
    const bigRect: Rect = { x: 0, y: 0, w: bigW, h: largeHeight };
    const topRect: Rect = { x: rightX, y: 0, w: rightW, h: smallHeight };
    const bottomRect: Rect = { x: rightX, y: bottomY, w: rightW, h: smallHeight };
    const leftOut: Rect = { x: -(bigW + columnGap), y: 0, w: bigW, h: largeHeight };
    const belowIn: Rect = { x: rightX, y: bottomY + smallHeight + columnGap, w: rightW, h: smallHeight };
    return { bigRect, topRect, bottomRect, leftOut, belowIn };
  }, [containerW, largeHeight, smallHeight]);

  useEffect(() => {
    if (cards.length <= POPULAR_VISIBLE) {
      setStart(0);
      return;
    }
    // Advance by ONE so the window slides like a queue.
    const id = setInterval(() => {
      setStart((prev) => (prev + 1) % cards.length);
    }, POPULAR_ROTATE_MS);
    return () => clearInterval(id);
  }, [cards.length]);

  useEffect(() => {
    if (!geo) return;
    const len = cards.length;
    if (len === 0) {
      setLive([]);
      return;
    }

    const ensureRect = (id: string, at: Rect): AnimRect => {
      let r = rectsRef.current.get(id);
      if (!r) {
        r = {
          x: new Animated.Value(at.x),
          y: new Animated.Value(at.y),
          w: new Animated.Value(at.w),
          h: new Animated.Value(at.h),
        };
        rectsRef.current.set(id, r);
      }
      return r;
    };
    const setRect = (id: string, at: Rect) => {
      const r = ensureRect(id, at);
      r.x.setValue(at.x);
      r.y.setValue(at.y);
      r.w.setValue(at.w);
      r.h.setValue(at.h);
    };
    const cardAt = (i: number) => cards[((i % len) + len) % len];

    // Static (no animation): place the visible window + one pre-mounted card.
    const snap = () => {
      animRef.current?.stop();
      animRef.current = null;
      const rects = [geo.bigRect, geo.topRect, geo.bottomRect];
      const list: LiveCard[] = [];
      const used = new Set<string>();
      for (let i = 0; i < Math.min(POPULAR_VISIBLE, len); i += 1) {
        const c = cardAt(start + i);
        if (!c || used.has(c.id)) continue;
        used.add(c.id);
        setRect(c.id, rects[i]);
        list.push({ card: c, titleSize: i === 0 ? 'lg' : 'sm' });
      }
      // Pre-mount the next card off-screen so its image is ready to slide in.
      if (len > POPULAR_VISIBLE) {
        const nextCard = cardAt(start + POPULAR_VISIBLE);
        if (nextCard && !used.has(nextCard.id)) {
          used.add(nextCard.id);
          setRect(nextCard.id, geo.belowIn);
          list.push({ card: nextCard, titleSize: 'sm' });
        }
      }
      for (const key of Array.from(rectsRef.current.keys())) {
        if (!used.has(key)) rectsRef.current.delete(key);
      }
      setLive(list);
    };

    const canAnimate =
      prevCardsRef.current === cards &&
      prevStartRef.current !== null &&
      len > POPULAR_VISIBLE &&
      (prevStartRef.current + 1) % len === start &&
      // Every card we need already has a rect (i.e. was previously mounted).
      [0, 1, 2, 3].every((i) => rectsRef.current.has(cardAt(prevStartRef.current! + i)?.id ?? ''));

    if (!canAnimate) {
      snap();
    } else {
      const oldStart = prevStartRef.current!;
      const leaving = cardAt(oldStart);
      const newBig = cardAt(start); // was top-right
      const newTop = cardAt(start + 1); // was bottom-right
      const newBottom = cardAt(start + 2); // was pre-mounted off-screen
      const newNext = cardAt(start + POPULAR_VISIBLE); // fresh pre-mount

      const list: LiveCard[] = [];
      const used = new Set<string>();
      const add = (c: CardItem | undefined, titleSize: 'sm' | 'lg') => {
        if (!c || used.has(c.id)) return;
        used.add(c.id);
        list.push({ card: c, titleSize });
      };
      add(leaving, 'lg');
      add(newBig, 'lg');
      add(newTop, 'sm');
      add(newBottom, 'sm');
      add(newNext, 'sm');
      setLive(list);

      const anims: Animated.CompositeAnimation[] = [];
      const moveTo = (c: CardItem | undefined, to: Rect) => {
        if (!c) return;
        const r = ensureRect(c.id, to);
        anims.push(
          Animated.timing(r.x, { toValue: to.x, duration: POPULAR_MOVE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(r.y, { toValue: to.y, duration: POPULAR_MOVE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(r.w, { toValue: to.w, duration: POPULAR_MOVE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(r.h, { toValue: to.h, duration: POPULAR_MOVE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })
        );
      };
      moveTo(leaving, geo.leftOut);
      moveTo(newBig, geo.bigRect);
      moveTo(newTop, geo.topRect);
      moveTo(newBottom, geo.bottomRect);

      // Fresh pre-mount sits off-screen ready for the next tick (only if it is a
      // genuinely distinct card, so we never teleport a visible one off-screen).
      const movingIds = new Set(
        [leaving, newBig, newTop, newBottom].filter(Boolean).map((c) => (c as CardItem).id)
      );
      if (newNext && !movingIds.has(newNext.id)) {
        setRect(newNext.id, geo.belowIn);
      }

      animRef.current?.stop();
      const composite = Animated.parallel(anims);
      animRef.current = composite;
      composite.start(({ finished }) => {
        if (!finished) return;
        // Drop the card that left the viewport.
        const keep = [newBig, newTop, newBottom, newNext].filter(Boolean) as CardItem[];
        const keepIds = new Set(keep.map((c) => c.id));
        for (const key of Array.from(rectsRef.current.keys())) {
          if (!keepIds.has(key)) rectsRef.current.delete(key);
        }
        setLive(
          keep.map((c, i) => ({ card: c, titleSize: (i === 0 ? 'lg' : 'sm') as 'sm' | 'lg' }))
        );
      });
    }

    prevStartRef.current = start;
    prevCardsRef.current = cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, geo, cards]);

  if (cards.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <View
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      style={{ height: largeHeight, overflow: 'hidden' }}
    >
      {live.map(({ card, titleSize }) => {
        const r = rectsRef.current.get(card.id);
        if (!r) return null;
        return (
          <Animated.View
            key={card.id}
            style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h }}
          >
            <FillCard card={card} onPress={onCardPress} titleSize={titleSize} />
          </Animated.View>
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
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
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
  // Eased 0->1 progress for the inline mic (driven by a scroll threshold, not
  // raw scroll position, so the reveal is smooth regardless of scroll speed).
  const inlineMicAnim = useRef(new Animated.Value(0)).current;
  const inlineMicShownRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(getHomeScrollOffset());
  const searchQueryRef = useRef(searchQuery);
  const searchResultsRef = useRef(searchResults);
  const knownCardsRef = useRef<CardItem[]>([]);
  const voiceSessionRef = useRef<SpeechToTextSession | null>(null);
  const voiceActiveRef = useRef(false);
  const voiceQueryRef = useRef<string | null>(null);
  /** Stable business-id order from the last natural/AI response — do not reshuffle. */
  const voiceResultOrderRef = useRef<string[] | null>(null);
  const userCityRef = useRef<string | null>(null);
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
  const searchPanelBorderColor = theme.isDark ? 'rgba(255,255,255,0.17)' : brandInkRgba(0.13);

  // Rotating AI-style suggestions used as the search placeholder when empty,
  // revealed with a typewriter effect (type out -> hold -> erase -> next).
  const searchSuggestions = useMemo(
    () => [
      'Hitta något kul att göra i helgen',
      'Sök restauranger, events, upplevelser',
      'Vad är du sugen på ikväll?',
      'Upptäck nya ställen nära dig',
    ],
    []
  );
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  useEffect(() => {
    let suggestionIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const full = searchSuggestions[suggestionIdx] ?? '';
      if (!deleting) {
        charIdx += 1;
        setTypedPlaceholder(full.slice(0, charIdx));
        if (charIdx >= full.length) {
          deleting = true;
          timeout = setTimeout(tick, 1800); // hold when fully typed
          return;
        }
        timeout = setTimeout(tick, 45); // typing speed
      } else {
        charIdx -= 1;
        setTypedPlaceholder(full.slice(0, Math.max(charIdx, 0)));
        if (charIdx <= 0) {
          deleting = false;
          suggestionIdx = (suggestionIdx + 1) % searchSuggestions.length;
          timeout = setTimeout(tick, 350); // pause before next
          return;
        }
        timeout = setTimeout(tick, 25); // erasing speed
      }
    };

    timeout = setTimeout(tick, 400);
    return () => clearTimeout(timeout);
  }, [searchSuggestions]);

  // Reveal/hide the inline mic with a smooth eased animation when crossing a
  // scroll threshold. Hysteresis (140 in / 90 out) prevents flicker.
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const shouldShow = inlineMicShownRef.current ? value > 90 : value > 140;
      if (shouldShow === inlineMicShownRef.current) return;
      inlineMicShownRef.current = shouldShow;
      Animated.timing(inlineMicAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, inlineMicAnim]);

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
    if (!coords || deals.length === 0) return;

    let cancelled = false;
    void (async () => {
      const enriched = await fillMissingDistancesFromAddresses(deals, coords, { maxGeocode: 24 });
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

  const clearVoiceSearchOwnership = useCallback(() => {
    voiceQueryRef.current = null;
    voiceResultOrderRef.current = null;
  }, []);

  const lockVoiceResultOrder = useCallback((cards: CardItem[]) => {
    voiceResultOrderRef.current = cards.map((card) => card.id);
  }, []);

  const applyVoiceResultOrder = useCallback((cards: CardItem[]) => {
    const order = voiceResultOrderRef.current;
    if (!order || order.length === 0) return cards;
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...cards].sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra === undefined && rb === undefined) return 0;
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    });
  }, []);

  const handleSearchTipPress = useCallback((tip: string) => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    clearVoiceSearchOwnership();
    setSearchQuery(tip);
    setIsSearchFocused(true);
  }, [clearVoiceSearchOwnership]);

  const stopVoiceSession = useCallback(() => {
    const wasListening = voiceActiveRef.current || voiceSessionRef.current != null;
    voiceActiveRef.current = false;
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    setVoiceListening(false);
    setVoiceSpeaking(false);
    // Delay so the cue isn't swallowed while the browser still holds the mic.
    if (wasListening) {
      playMicCue('off', { delayMs: 120 });
    }
  }, []);

  const runVoiceSearch = useCallback(
    async (transcript: string) => {
      // Keep the transcript intact for the backend (only trim ends / enforce max length).
      const q = transcript.trim().slice(0, 500);
      if (q.length < 2) {
        showAlert('Ingen röst', 'Jag hörde inget tydligt. Försök igen.');
        return;
      }

      voiceQueryRef.current = q;
      setSearchQuery(q);
      setIsSearchFocused(false);
      setIsSearchLoading(true);
      setVoiceStatusMessage(null);

      try {
        let city = userCityRef.current ?? undefined;
        if (!city) {
          try {
            const meRes = await authFetch('/user/me');
            if (meRes.ok) {
              const me = (await meRes.json().catch(() => ({}))) as { location?: string };
              const loc = typeof me.location === 'string' ? me.location.trim() : '';
              if (loc) {
                userCityRef.current = loc;
                city = loc;
              }
            }
          } catch {
            // City is optional for /search/natural.
          }
        }

        const results = await searchNatural(q, authFetch, {
          source: 'voice',
          city,
          take: 16,
          maxHydrate: 12,
          knownCards: knownCardsRef.current as OfferCardItem[],
        });
        // 200 with results=[] is a valid empty state — do not treat as error.
        // Do not require response source === "ai-hybrid".
        const next = results as CardItem[];
        lockVoiceResultOrder(next);
        setSearchResults(next);
        setHomeSearchCache(q, next as OfferCardItem[]);
      } catch (error) {
        const status = (error as Error & { status?: number })?.status;
        clearVoiceSearchOwnership();
        if (status === 401) {
          showAlert('Inloggning krävs', 'Logga in igen för att använda röstsökning.');
        } else {
          showAlert('Sökfel', 'Kunde inte söka med rösten. Försök igen.');
        }
      } finally {
        setIsSearchLoading(false);
      }
    },
    [authFetch, clearVoiceSearchOwnership, lockVoiceResultOrder]
  );

  const handleVoiceSearch = useCallback(() => {
    if (!isLoggedIn) {
      showAlert('Logga in', 'Du behöver vara inloggad för att söka med rösten.');
      return;
    }

    if (voiceListening) {
      stopVoiceSession();
      return;
    }

    const support = getSpeechSupportInfo();
    if (!support.supported) {
      const message =
        support.reason ??
        'Röstigenkänning stöds inte här. Prova Google Chrome eller Microsoft Edge.';
      setVoiceStatusMessage(message);
      showAlert('Röstsökning', message);
      return;
    }

    setVoiceStatusMessage(null);
    voiceActiveRef.current = true;
    setVoiceListening(true);
    setVoiceSpeaking(false);
    playMicCue('on');

    const session = startSpeechToText({
      lang: 'sv-SE',
      continuous: true,
      // Silence defaults are longer on mobile (see speech-to-text.ts) so the
      // mic does not cut off before Chrome reports the first speech events.
      onPartial: (text) => {
        if (text.trim()) {
          setSearchQuery(text.trim());
        }
      },
      onSpeakingChange: setVoiceSpeaking,
    });
    voiceSessionRef.current = session;

    void session.done
      .then((transcript) => {
        const wasActive = voiceActiveRef.current;
        voiceSessionRef.current = null;
        voiceActiveRef.current = false;
        // Claim this query before flipping listening off, so the keyword
        // search effect cannot race and overwrite natural results (same hits,
        // different order).
        const claimed = transcript.trim().slice(0, 500);
        if (claimed.length >= 2) {
          voiceQueryRef.current = claimed;
        }
        if (wasActive) {
          playMicCue('off', { delayMs: 120 });
        }
        setVoiceListening(false);
        setVoiceSpeaking(false);
        return runVoiceSearch(transcript);
      })
      .catch((error: Error) => {
        const wasActive = voiceActiveRef.current;
        voiceSessionRef.current = null;
        voiceActiveRef.current = false;
        if (wasActive) {
          playMicCue('off', { delayMs: 120 });
        }
        setVoiceListening(false);
        setVoiceSpeaking(false);
        const code = error?.message ?? '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          const message =
            'Tillåt mikrofonåtkomst i webbläsaren (låsikonen till vänster om adressfältet) och försök igen.';
          setVoiceStatusMessage(message);
          showAlert('Mikrofon blockerad', message);
          return;
        }
        if (code === 'SPEECH_UNSUPPORTED') {
          const message =
            'Röstigenkänning stöds inte här. Prova Google Chrome eller Microsoft Edge.';
          setVoiceStatusMessage(message);
          showAlert('Röstsökning', message);
          return;
        }
        if (code === 'network') {
          const message =
            'Röstigenkänning i Chrome behöver internet (Google Speech). Kontrollera nätverket.';
          setVoiceStatusMessage(message);
          showAlert('Ingen anslutning', message);
          return;
        }
        if (code !== 'aborted' && code !== 'no-speech') {
          const message = `Kunde inte lyssna (${code || 'okänt fel'}). Försök igen i Chrome.`;
          setVoiceStatusMessage(message);
          showAlert('Röstfel', message);
        }
      });
  }, [isLoggedIn, voiceListening, stopVoiceSession, runVoiceSearch]);

  useEffect(() => {
    if (!isLoggedIn) {
      userCityRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const meRes = await authFetch('/user/me');
        if (!meRes.ok || cancelled) return;
        const me = (await meRes.json().catch(() => ({}))) as { location?: string };
        const loc = typeof me.location === 'string' ? me.location.trim() : '';
        if (!cancelled && loc) {
          userCityRef.current = loc;
        }
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, isLoggedIn]);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
    };
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
          const knownCards = [...dealsList, ...hotFromApi, ...nearYouFromApi];
          const [hydratedDeals, hydratedHot, hydratedNear] = await Promise.all([
            hydrateOfferCardImages(dealsList, { knownCards }),
            hydrateOfferCardImages(hotFromApi, { knownCards }),
            hydrateOfferCardImages(nearYouFromApi, { knownCards }),
          ]);
              if (cancelled) return;
          setDeals(hydratedDeals);
          setHotOfferCards(hydratedHot);
          setNearYouCards(hydratedNear);
          setHomeHotOffersCache(hydratedHot);
          setHomeEndingSoonCache(hydratedNear);
          schedulePrefetchImageUris(
            [
              ...hydratedDeals.slice(0, 12).map((card) => card.image),
              ...hydratedNear.slice(0, 6).map((card) => card.image),
              ...hydratedHot.slice(0, 6).map((card) => card.image),
            ],
            24
          );
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

  const filteredDeals = useMemo(
    () => filterCardsByActiveCategory(deals, activeCategory),
    [activeCategory, deals]
  );

  const filteredHotOfferCards = useMemo(
    () => filterCardsByActiveCategory(hotOfferCards, activeCategory),
    [activeCategory, hotOfferCards]
  );

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
    const offers = pool.find((cat) => cat.id === OFFERS_CATEGORY_ID);
    const familj = pool.find((cat) => {
      if (cat.id === OFFERS_CATEGORY_ID) return false;
      const label = cat.label.trim().toLowerCase();
      return label.includes('familj') || label.includes('family') || label.includes('barn');
    });
    const rest = pool.filter((cat) => cat.id !== OFFERS_CATEGORY_ID && cat !== familj);
    const allChip: FilterCategory = { id: ALL_CATEGORIES_ID, label: 'Alla' };
    const ordered = [
      ...(offers ? [offers] : []),
      allChip,
      ...(familj ? [familj] : []),
      ...rest,
    ];
    return ordered.map((cat) => ({ ...cat, icon: getCategoryIconName(cat.label) }));
  }, [categoryOptions]);

  const isSpecificCategorySelected =
    activeCategory !== ALL_CATEGORIES_ID && activeCategory !== OFFERS_CATEGORY_ID;

  const selectedCategory = useMemo(
    () => quickCategories.find((cat) => cat.id === activeCategory) ?? null,
    [quickCategories, activeCategory]
  );

  // Reshuffles each time a different category is selected (or when data reloads).
  const selectedCategoryCards = useMemo(
    () => (isSpecificCategorySelected ? applyCarouselMode(filteredDeals, 'random', 10) : []),
    [isSpecificCategorySelected, activeCategory, filteredDeals]
  );

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
      clearVoiceSearchOwnership();
      return;
    }

    if (!isSearchActive) {
      setSearchResults([]);
      setIsSearchLoading(false);
      setHomeSearchCache(searchQuery, []);
      return;
    }

    // Voice/AI natural search already filled results for this query — don't overwrite.
    if (voiceQueryRef.current === trimmedSearchQuery) {
      setIsSearchLoading(false);
      return;
    }

    // Still capturing speech — wait for the natural search pass.
    if (voiceListening) {
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
          if (cancelled) return;
          // Voice/natural search owns this query — keep its relevance order.
          if (voiceQueryRef.current === trimmedSearchQuery) return;
          const next = results as CardItem[];
          setSearchResults(next);
          setHomeSearchCache(trimmedSearchQuery, next as OfferCardItem[]);
        })
        .catch(() => {
          if (cancelled) return;
          if (voiceQueryRef.current === trimmedSearchQuery) return;
          setSearchResults([]);
          setHomeSearchCache(trimmedSearchQuery, []);
        })
        .finally(() => {
          if (!cancelled && voiceQueryRef.current !== trimmedSearchQuery) {
            setIsSearchLoading(false);
          }
        });
    }, hasCachedResults ? 0 : 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSearchActive, searchQuery, trimmedSearchQuery, voiceListening, clearVoiceSearchOwnership]);

  useEffect(() => {
    if (!coords || !isSearchActive || searchResults.length === 0) return;

    let cancelled = false;
    const snapshot = searchResults;
    const queryAtStart = trimmedSearchQuery;
    void (async () => {
      const enriched = await fillMissingDistancesFromAddresses(snapshot, coords, {
        maxGeocode: 20,
      });
      if (cancelled) return;
      // Don't clobber a newer search (or voice ranking) with stale enrichment.
      if (voiceQueryRef.current && voiceQueryRef.current !== queryAtStart) return;
      if (trimmedSearchQuery !== queryAtStart) return;
      // Distance badges only — keep AI/natural relevance order intact.
      const next = applyVoiceResultOrder(enriched);
      setSearchResults(next);
      setHomeSearchCache(queryAtStart, next as OfferCardItem[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    coords,
    isSearchActive,
    trimmedSearchQuery,
    searchResults.length,
    applyVoiceResultOrder,
  ]);

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

  // Voice-search hero needs room for headline + orb + copy.
  const heroContentHeight = isLoggedIn ? 268 : HERO_HEIGHT;
  const heroBlockHeight = heroContentHeight + heroTopInset;
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
    outputRange: [4, collapsedHeaderTopPadding],
    extrapolate: 'clamp',
  });
  const webStickyTopPadding = scrollY.interpolate({
    inputRange: [0, heroBlockHeight],
    outputRange: [10, heroTopInset + 10 - searchPanelStickyLift],
    extrapolate: 'clamp',
  });
  // Mic drops in from the top beside the search bar, driven by the eased anim.
  const inlineMicWidth = inlineMicAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SEARCH_BAR_HEIGHT],
  });
  const inlineMicMarginLeft = inlineMicAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 10],
  });
  const inlineMicTranslateY = inlineMicAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SEARCH_BAR_HEIGHT, 0],
  });
  const inlineMicOpacity = inlineMicAnim;
  const searchDropdownExpanded = showSearchTipsDropdown || isSearchDropdownMounted;
  const searchDropdownDividerColor = 'rgba(0, 0, 0, 0.08)';

  const searchPanelStyle = {
    backgroundColor: homeHeaderPanelBg,
    borderBottomLeftRadius: SEARCH_PANEL_BOTTOM_RADIUS,
    borderBottomRightRadius: SEARCH_PANEL_BOTTOM_RADIUS,
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
        <View style={styles.searchBarWithMicRow}>
        <View style={styles.searchBarDropdownHost}>
        {renderSearchTipsDropdown()}

        <View
          style={[
            filterSurfaceStyle,
            styles.searchBarRow,
            {
              height: SEARCH_BAR_HEIGHT,
              width: '100%',
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
          <Ionicons name="sparkles" size={18} color="#7c5cf6" style={styles.searchBarIcon} />
          <View style={styles.searchBarInputSlot}>
                <TextInput
              nativeID="home-search-input"
                  value={searchQuery}
                  onChangeText={(text) => {
                    clearVoiceSearchOwnership();
                    setSearchQuery(text);
                  }}
              onFocus={openSearchDropdown}
              onBlur={closeSearchDropdown}
                  placeholder={`${typedPlaceholder}|`}
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
              clearVoiceSearchOwnership();
              stopVoiceSession();
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

          {isLoggedIn ? (
            <Animated.View
              style={{
                width: inlineMicWidth,
                marginLeft: inlineMicMarginLeft,
                height: SEARCH_BAR_HEIGHT,
                overflow: 'hidden',
                alignItems: 'center',
              }}
            >
              <Animated.View
                style={{
                  opacity: inlineMicOpacity,
                  transform: [{ translateY: inlineMicTranslateY }],
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sök med rösten"
                  hitSlop={8}
                  onPress={handleVoiceSearch}
                  style={styles.inlineMicButtonWrap}
                >
                  <LinearGradient
                    colors={
                      voiceListening
                        ? (['#ef4444', '#dc2626'] as [string, string])
                        : ([theme.linkSoft, theme.link] as [string, string])
                    }
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.inlineMicBox}
                  >
                    <Ionicons name="mic" size={20} color="#ffffff" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </Animated.View>
          ) : null}
            </View>
            </View>

      <View className="mt-2" style={{ zIndex: 1, elevation: 1 }}>
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

      <View
        pointerEvents="none"
        style={[styles.searchPanelBottomEdge, { borderColor: searchPanelBorderColor }]}
      />
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
            <View style={[styles.heroBlock, { height: heroBlockHeight }]}>
              {isLoggedIn ? (
                <HeroMicButton
                  height={heroBlockHeight}
                  backgroundColor={homeHeaderPanelBg}
                  topInset={heroTopInset}
                  listening={voiceListening}
                  speaking={voiceSpeaking}
                  statusMessage={voiceStatusMessage}
                  onPress={handleVoiceSearch}
                />
              ) : (
                <HeroImageCarousel
                  slides={heroSlides}
                  panelBackgroundColor={homeHeaderPanelBg}
                  topInset={heroTopInset}
                />
              )}
            </View>
          ) : (
            <Animated.View style={[styles.heroBlock, { height: heroHeight }]}>
              {isLoggedIn ? (
                <HeroMicButton
                  height={heroBlockHeight}
                  backgroundColor={homeHeaderPanelBg}
                  topInset={heroTopInset}
                  listening={voiceListening}
                  speaking={voiceSpeaking}
                  statusMessage={voiceStatusMessage}
                  onPress={handleVoiceSearch}
                />
              ) : (
                <HeroImageCarousel
                  slides={heroSlides}
                  panelBackgroundColor={homeHeaderPanelBg}
                  topInset={heroTopInset}
                />
              )}
            </Animated.View>
          )}
        </View>

        <View style={searchPanelStyle} pointerEvents="box-none">
          {Platform.OS === 'web' ? (
            <Animated.View
              pointerEvents="box-none"
              style={{
                paddingTop: webStickyTopPadding,
                paddingBottom: 0,
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
                paddingBottom: 0,
                backgroundColor: homeHeaderPanelBg,
              }}
            >
              {renderHomeSearchHeader()}
            </Animated.View>
          )}
        </View>

        <View className="mt-4 px-6">
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
                          title="Populärt just nu"
                          icon="flame"
                          iconColor={OFFERS_CATEGORY_ACCENT}
                          subtitle="Baserat på din sökning"
                          onSeeAllPress={() => openSearchResultsView('hot')}
                        />
                        <FeaturedDealsSplit
                          cards={searchedHot}
                          onCardPress={handleCardPress}
                          emptyText={`Inga populära erbjudanden för "${trimmedSearchQuery}".`}
                        />
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              {isSpecificCategorySelected && selectedCategory ? (
                <View className="mb-6">
                  <SectionTitleRow
                    title={selectedCategory.label}
                    icon={selectedCategory.icon}
                    iconColor={getCategoryAccentColor(selectedCategory.label)}
                    subtitle="Slumpad ordning"
                  />
                  {isLoadingData && selectedCategoryCards.length === 0 ? (
                    <Text style={{ color: theme.textMuted }}>Laddar...</Text>
                  ) : (
                    <ForYouOrderCarousel
                      cards={selectedCategoryCards}
                      onCardPress={handleCardPress}
                      badgeLabel={selectedCategory.label}
                      badgeColor={getCategoryAccentColor(selectedCategory.label)}
                      showFavoriteButton
                      showActivityDots
                      businessIdsWithEvents={businessIdsWithEvents}
                      emptyText={`Inga träffar i ${selectedCategory.label} just nu.`}
                    />
                  )}
                </View>
              ) : null}
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
            title="Populärt just nu"
            icon="flame"
                  iconColor={OFFERS_CATEGORY_ACCENT}
            subtitle="Baserat på dina intressen"
                  onSeeAllPress={() => router.push(HETA_ERBJUDANDEN_PATH)}
          />
          {isLoadingData && hotOfferCards.length === 0 ? (
            <Text style={{ color: theme.textMuted }}>Laddar...</Text>
          ) : (
            <AnimatedFeaturedDeals
              cards={filteredHotOfferCards}
              onCardPress={handleCardPress}
              emptyText="Inga populära erbjudanden just nu."
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
  heroBlock: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  searchPanelBottomEdge: {
    marginTop: 3,
    height: SEARCH_PANEL_BOTTOM_RADIUS,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: SEARCH_PANEL_BOTTOM_RADIUS,
    borderBottomRightRadius: SEARCH_PANEL_BOTTOM_RADIUS,
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
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  searchBarIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  searchBarWithMicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchBarDropdownHost: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
    elevation: 2,
    overflow: 'visible',
  },
  inlineMicButtonWrap: {
    flexShrink: 0,
  },
  inlineMicBox: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
