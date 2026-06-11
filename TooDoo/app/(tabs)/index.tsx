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
  View,
} from 'react-native';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppReady } from '@/context/app-ready-context';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
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
import {
  applyHaversineDistances,
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  getUserCoords,
  haversineKm,
} from '@/lib/geo';
import { prefetchImageUris } from '@/lib/image-prefetch';
import { useFavorites } from '@/context/favorites-context';
import { openOfferDetail } from '@/lib/open-offer-detail';
import {
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
  getDiscountBadgeColor,
  resolveBusinessIdFromOrder,
  type OfferCardItem,
} from '@/lib/home-offers';
import {
  clearHomeSearchCache,
  getHomeScreenSnapshot,
  getHomeScrollOffset,
  getHomeSearchCache,
  setHomeEndingSoonCache,
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

const IMAGE_HYDRATE_CONCURRENCY = 5;

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';

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

function buildOrderCardsFromCatalog(
  ordersRaw: any[],
  approvedBusinesses: ApiBusiness[],
  mode: 'hot' | 'endingSoon' | 'random',
  limit = 10
): CardItem[] {
  return applyCarouselMode(buildCatalogOfferCardsFlat(ordersRaw, approvedBusinesses), mode, limit);
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
}: {
  cards: CardItem[];
  onCardPress?: (card: CardItem) => void;
  emptyText: string;
  badgeLabel: string;
  badgeColor: string;
  getBadgeLabel?: (card: CardItem) => string;
  /** Only företag (not individual erbjudanden) should be favoritable. */
  showFavoriteButton?: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { token, role } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const items = cards.slice(0, 10);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <ScrollView
      horizontal
      removeClippedSubviews
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
              <CardMedia source={card.image} svgFit="fill" priority={idx < 4 ? 'high' : 'normal'} />
              <View className="absolute inset-0 bg-black/20" />
              <View
                className="absolute left-2 top-2 rounded-full px-2 py-1"
                style={{ backgroundColor: badgeColor }}
              >
                <Text className="text-[10px] font-semibold text-white">
                  {getBadgeLabel ? getBadgeLabel(card) : badgeLabel}
                </Text>
              </View>
              {showFavoriteButton && token && role === 'USER' ? (
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
        Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as const) : null,
      ]}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <CardMedia source={card.image} svgFit="fill" />
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
              <CardMedia source={card.image} svgFit="fill" priority={idx < 4 ? 'high' : 'normal'} />
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom);
  const heroTopInset = useHeroTopInset();
  const scrollY = useRef(new Animated.Value(getHomeScrollOffset())).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(getHomeScrollOffset());
  const searchQueryRef = useRef(searchQuery);
  const searchResultsRef = useRef(searchResults);
  searchQueryRef.current = searchQuery;
  searchResultsRef.current = searchResults;
  const router = useRouter();
  const { markDataReady } = useAppReady();
  const { token } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const homePageBg = theme.cardBg;
  const homeHeaderPanelBg = theme.screenBg;
  const filterSurfaceStyle = FilterChipTheme.surface;
  const searchPanelBorderColor = theme.isDark ? 'rgba(255,255,255,0.10)' : brandInkRgba(0.10);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((prev) => prev + 1);
  }, []);

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

    const loadHomeData = async (background = false) => {
      const hasSnapshot = Boolean(getHomeScreenSnapshot());
      if (hasSnapshot && refreshNonce === 0 && !background) {
        markDataReady();
        setTimeout(() => {
          if (!cancelled) void loadHomeData(true);
        }, 500);
        return;
      }

      if (!hasSnapshot && !background) {
        setIsLoadingData(true);
      }
      try {
        const [categoryRes, businessRes, ordersRes] = await Promise.all([
          fetch(apiUrl('/category')),
          fetch(apiUrl('/business?status=APPROVED')),
          fetch(apiUrl('/orders')),
        ]);

        const categoryJson = await categoryRes.json().catch(() => []);
        const businessJson = await businessRes.json().catch(() => []);
        const ordersJson = await ordersRes.json().catch(() => []);

        const categoriesRaw: ApiCategory[] = Array.isArray(categoryJson)
          ? categoryJson
          : Array.isArray(categoryJson?.categories)
            ? categoryJson.categories
            : Array.isArray(categoryJson?.data)
              ? categoryJson.data
              : [];

        const businessesRaw: ApiBusiness[] = Array.isArray(businessJson)
          ? businessJson
          : Array.isArray(businessJson?.businesses)
            ? businessJson.businesses
            : Array.isArray(businessJson?.data)
              ? businessJson.data
              : [];

        const ordersRaw: ApiOrder[] = Array.isArray(ordersJson)
          ? ordersJson
          : Array.isArray(ordersJson?.orders)
            ? ordersJson.orders
            : Array.isArray(ordersJson?.data)
              ? ordersJson.data
              : [];

        const approvedBusinessesEarly = businessesRaw.filter(
          (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
        );

        const ordersFromBusinessList = businessesRaw.flatMap(parseOrdersFromBusinessRecord);
        let allOrdersRaw = mergeOrdersById(ordersRaw, ordersFromBusinessList);
        if (!token) {
          const fromBusinessDetails = await fetchOrdersFromBusinessDetails(approvedBusinessesEarly);
          allOrdersRaw = mergeOrdersById(allOrdersRaw, fromBusinessDetails);
        } else if (allOrdersRaw.length === 0) {
          allOrdersRaw = await fetchOrdersFromBusinessDetails(approvedBusinessesEarly.slice(0, 16));
        }

        let nearYouFromApi: CardItem[] = [];
        let hotFromApi: CardItem[] = [];
        if (token) {
          const authHeaders = { Authorization: `Bearer ${token}` };
          const closeUrl = coords
            ? `/orders/for-you/close?take=10&lat=${coords.lat}&lng=${coords.lng}`
            : '/orders/for-you/close?take=10';
          const [closeRes, hotRes] = await Promise.all([
            fetch(apiUrl(closeUrl), { headers: authHeaders }),
            fetch(apiUrl('/orders/for-you/hot?take=10'), { headers: authHeaders }),
          ]);
          const closeJson = closeRes.ok ? await closeRes.json().catch(() => ({})) : {};
          const hotJson = hotRes.ok ? await hotRes.json().catch(() => ({})) : {};
          const nowMsForYou = Date.now();
          nearYouFromApi = buildCatalogOfferCardsFlat(
            parseOrdersPayload(closeJson).filter((order) => isActiveOffer(order, nowMsForYou)),
            approvedBusinessesEarly
          );
          hotFromApi = buildCatalogOfferCardsFlat(
            parseOrdersPayload(hotJson).filter((order) => isActiveOffer(order, nowMsForYou)),
            approvedBusinessesEarly
          );
        }

        const categoryNameById = new Map<string, string>();
        categoriesRaw.forEach((category) => {
          const id = category.id ?? category._id;
          if (id && category.name) {
            categoryNameById.set(id, category.name);
          }
        });

        const apiCategoryFilters: FilterCategory[] = categoriesRaw
          .map((category, index) => {
            const id = category.id ?? category._id ?? `category-${index}`;
            const name = category.name?.trim();
            if (!name) {
              return null;
            }

            return {
              id,
              label: name,
            };
          })
          .filter((item): item is FilterCategory => Boolean(item));

        const ordersByBusinessId = new Map<string, ApiOrder[]>();
        allOrdersRaw.forEach((order) => {
          const businessId =
            typeof order.businessId === 'string'
              ? order.businessId
              : order.businessId?.id ?? order.businessId?._id;

          if (!businessId) {
            return;
          }

          if (!ordersByBusinessId.has(businessId)) {
            ordersByBusinessId.set(businessId, []);
          }
          ordersByBusinessId.get(businessId)?.push(order);
        });

        const nowMs = Date.now();

        const approvedBusinesses = approvedBusinessesEarly;

        // Mirror the portal behavior: if the backend doesn't return `imageUrl` consistently,
        // fall back to the last known value per business id from local storage.
        const businessImageCacheKey = (businessId: string) => `toodoo_business_image_url_${businessId}`;
        const approvedBusinessIds = approvedBusinesses.map(
          (b, i) => String(b.id ?? b._id ?? `business-${i}`)
        );

        const cachedImageUrlByBusinessId = new Map<string, string>();
        try {
          const cachedPairs = await AsyncStorage.multiGet(
            approvedBusinessIds.map((id) => businessImageCacheKey(id))
          );
          cachedPairs.forEach(([key, value]) => {
            if (!value) return;
            const match = key.match(/^toodoo_business_image_url_(.+)$/);
            const id = match?.[1];
            if (id) cachedImageUrlByBusinessId.set(id, value);
          });
        } catch {
          // ignore cache read errors
        }

        const cards: CardItem[] = approvedBusinesses.map((business, index) => {
          const businessId = business.id ?? business._id ?? `business-${index}`;
          const businessOrders = ordersByBusinessId.get(businessId) ?? [];
          const visibleOrders = businessOrders.filter((order) => isActiveOffer(order, nowMs));

          const offers = visibleOrders.map((order) => order.title ?? 'Erbjudande');
          const orderIds = visibleOrders.map((order, orderIndex) => order.id ?? order._id ?? `${businessId}-order-${orderIndex}`);
          const offerPrices = visibleOrders.map((order) => String(order.price ?? 0));
          const offerOriginalPrices = visibleOrders.map((order) => order.originalPrice !== undefined ? String(order.originalPrice) : '');
          const offerClaimed = visibleOrders.map((order) =>
            String(order.claimedRedemptions ?? order.claimedCount ?? 0)
          );
          const offerAmount = visibleOrders.map((order) => String(order.maxRedemptions ?? 0));
          const offerEnd = visibleOrders.map((order) => order.orderTimeTo ?? '');
          const firstVisibleOrder = visibleOrders[0] as any | undefined;

          const cachedBusinessImageUrl = cachedImageUrlByBusinessId.get(String(businessId));
          const effectiveBusinessImageUrl =
            typeof business.imageUrl === 'string' && business.imageUrl.trim()
              ? business.imageUrl
              : typeof (business as any)?.image?.publicUrl === 'string' && (business as any).image.publicUrl.trim()
                ? (business as any).image.publicUrl
              : cachedBusinessImageUrl;

          const imageCandidateRaw =
            effectiveBusinessImageUrl ??
            (business as any)?.image?.publicUrl ??
            (business as any)?.image?.url ??
            (business as any).imageUri ??
            (business as any).imageURI ??
            (business as any).imagePath ??
            (business as any).imageKey ??
            (business as any).thumbnailUrl ??
            (business as any).thumbnail?.url ??
            (business as any).logoUrl ??
            (business as any).logo?.url ??
            (business as any).logo ??
            (business as any).photoUrl ??
            (business as any).pictureUrl ??
            (business as any).mediaUrl ??
            (business as any).media?.url ??
            // If businesses don't carry an image, fall back to the first active order image.
            firstVisibleOrder?.imageUrl ??
            firstVisibleOrder?.imageURI ??
            firstVisibleOrder?.imageUri ??
            firstVisibleOrder?.imagePath ??
            firstVisibleOrder?.photoUrl ??
            firstVisibleOrder?.thumbnailUrl ??
            firstVisibleOrder?.image?.url ??
            firstVisibleOrder?.image?.publicUrl ??
            // Sometimes image is an array of URLs.
            (Array.isArray((business as any).images) ? (business as any).images[0] : undefined);

          const normalizedImageUri = normalizeImageUrl(imageCandidateRaw);

          const resolvedCategoryIdRaw =
            (business as any)?.categoryId ??
            (business as any)?.category?.id ??
            (business as any)?.category?._id ??
            (business as any)?.category;
          const resolvedCategoryId =
            typeof resolvedCategoryIdRaw === 'string' || typeof resolvedCategoryIdRaw === 'number'
              ? String(resolvedCategoryIdRaw)
              : undefined;

          return {
            id: businessId,
            title: business.name ?? 'Okänd verksamhet',
            image: {
              uri:
                normalizedImageUri ?? `https://picsum.photos/seed/${encodeURIComponent(businessId)}/300/200`,
            },
            categoryId: resolvedCategoryId,
            categoryName:
              business.categoryName ??
              (resolvedCategoryId ? categoryNameById.get(resolvedCategoryId) : undefined),
            deal: visibleOrders.length > 0,
            orderIds,
            erbjudandepris: offerPrices,
            erbjudandeoriginalpris: offerOriginalPrices,
            Adress: [business.address, business.city].filter(Boolean).join(', ') || 'Adress saknas',
            latitude: business.latitude,
            longitude: business.longitude,
            Telefon: business.contactPhone ?? undefined,
            Website: business.website ?? '',
            kortbeskrivning: business.description ?? '',
            långbeskrivning: business.description ?? '',
            erbjudande: offers,
            erbjudandeclaimade: offerClaimed,
            erbjudandemängd: offerAmount,
            erbjudandelängd: offerEnd,
          };
        });

        // Update cache with any `imageUrl` we did receive from the backend.
        try {
          const toCache: [string, string][] = approvedBusinesses
            .map((business, index) => {
              const businessId = String(business.id ?? business._id ?? `business-${index}`);
              const url =
                typeof business.imageUrl === 'string'
                  ? business.imageUrl.trim()
                  : typeof (business as any)?.image?.publicUrl === 'string'
                    ? String((business as any).image.publicUrl).trim()
                    : '';
              if (!url) return null;
              return [businessImageCacheKey(businessId), url] as [string, string];
            })
            .filter((pair): pair is [string, string] => Boolean(pair));

          if (toCache.length > 0) {
            await AsyncStorage.multiSet(toCache);
          }
        } catch {
          // ignore cache write errors
        }

        // "Nära dig" lists real approved companies regardless of whether they
        // currently have an active (non-expired) offer.
        // When the user's location is known, rank by actual distance (nearest
        // first); otherwise fall back to surfacing companies with active offers.
        const cardsWithDistance = cards.map((card) => {
          if (
            coords &&
            typeof card.latitude === 'number' &&
            typeof card.longitude === 'number' &&
            Number.isFinite(card.latitude) &&
            Number.isFinite(card.longitude)
          ) {
            return {
              ...card,
              distanceKm: haversineKm(coords.lat, coords.lng, card.latitude, card.longitude),
            };
          }
          return card;
        });

        const dealsList = coords
          ? [...cardsWithDistance].sort((a, b) => {
              const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
              const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
              if (da !== db) return da - db;
              return Number(b.deal) - Number(a.deal);
            })
          : [...cardsWithDistance].sort((a, b) => Number(b.deal) - Number(a.deal));
        const businessOfferCards = buildOfferCardsFromBusinessCards(cards);
        const catalogCardsFlat = buildCatalogOfferCardsFlat(allOrdersRaw, approvedBusinessesEarly);

        if (token) {
          if (nearYouFromApi.length === 0) {
            nearYouFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'endingSoon');
          }
          if (hotFromApi.length === 0) {
            hotFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'hot');
          }
        } else {
          nearYouFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'endingSoon');
          hotFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'random');
        }

        if (!cancelled) {
          setCategoryFilters(apiCategoryFilters);
          setDeals(dealsList);
          setNearYouCards(nearYouFromApi);
          setHotOfferCards(hotFromApi);

          setHomeScreenSnapshot({
            categoryFilters: apiCategoryFilters,
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
          setHomeHotOffersCache(hotFromApi as OfferCardItem[]);
          setHomeEndingSoonCache(nearYouFromApi as OfferCardItem[]);

          void prefetchImageUris(
            [
              ...dealsList.slice(0, 12).map((c) => c.image),
              ...nearYouFromApi.slice(0, 6).map((c) => c.image),
              ...hotFromApi.slice(0, 6).map((c) => c.image),
            ],
            20
          );
        }

        // If list endpoint omits `imageUrl`, hydrate missing images by fetching the portal-like
        // details endpoint `GET /business/:id` in the background, then cache + update UI.
        void (async () => {
          const needsHydrationIds = approvedBusinesses
            .map((business, index) => String(business.id ?? business._id ?? `business-${index}`))
            .filter((id) => {
              const card = cards.find((c) => String(c.id) === id);
              const uri =
                typeof card?.image === 'object' && card.image && 'uri' in card.image
                  ? String((card.image as any).uri ?? '')
                  : '';
              return !uri || isLikelyPicsumUrl(uri);
            })
            .slice(0, 20);

          if (needsHydrationIds.length === 0) return;

          const fetchBusinessImage = async (id: string): Promise<{ id: string; uri: string } | null> => {
            try {
              const res = await fetch(apiUrl(`/business/${encodeURIComponent(id)}`));
              const json = await res.json().catch(() => ({}));
              const imageUrlRaw =
                (json as any)?.imageUrl ??
                (json as any)?.image?.publicUrl ??
                (json as any)?.image?.url ??
                (json as any)?.business?.imageUrl ??
                (json as any)?.business?.image?.publicUrl ??
                (json as any)?.business?.image?.url ??
                (Array.isArray((json as any)?.images) ? (json as any).images[0] : undefined);

              const normalized = normalizeImageUrl(imageUrlRaw);
              if (!normalized) return null;
              return { id, uri: normalized };
            } catch {
              return null;
            }
          };

          const imageByBusinessId = new Map<string, string>();
          const fetchedPairs: [string, string][] = [];

          for (let i = 0; i < needsHydrationIds.length; i += IMAGE_HYDRATE_CONCURRENCY) {
            if (cancelled) return;
            const batch = needsHydrationIds.slice(i, i + IMAGE_HYDRATE_CONCURRENCY);
            const results = await Promise.all(batch.map(fetchBusinessImage));
            for (const result of results) {
              if (!result) continue;
              imageByBusinessId.set(result.id, result.uri);
              fetchedPairs.push([businessImageCacheKey(result.id), result.uri]);
            }
          }

          if (cancelled || imageByBusinessId.size === 0) return;

          const patchCardImage = (prev: CardItem[]) =>
            prev.map((c) => {
              const nextUri = imageByBusinessId.get(String(c.id));
              return nextUri ? { ...c, image: { uri: nextUri } } : c;
            });

          setDeals(patchCardImage);

          void prefetchImageUris([...imageByBusinessId.values()], imageByBusinessId.size);

          try {
            if (fetchedPairs.length > 0) {
              await AsyncStorage.multiSet(fetchedPairs);
            }
          } catch {
            // ignore cache write errors
          }
        })();
      } catch {
        if (!cancelled) {
          setCategoryFilters([]);
          setDeals([]);
          setNearYouCards([]);
          setHotOfferCards([]);
          Alert.alert('Fel', 'Kunde inte ladda startsidan just nu.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
          setIsRefreshing(false);
          markDataReady();
        }
      }
    };

    loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [markDataReady, refreshNonce, token]);

  const filteredDeals = useMemo(() => {
    if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
      return deals;
    }

    return deals.filter((card) => card.categoryId === activeCategory);
  }, [activeCategory, deals]);

  const trimmedSearchQuery = searchQuery.trim();
  const isSearchActive = trimmedSearchQuery.length >= 2;
  const isSearchTooShort = trimmedSearchQuery.length === 1;

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
        knownCards: [...deals, ...hotOfferCards, ...nearYouCards],
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
    }, hasCachedResults ? 0 : 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deals, hotOfferCards, isSearchActive, nearYouCards, trimmedSearchQuery]);

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
  const heroCollapseScroll = 120;
  const heroHeight = scrollY.interpolate({
    inputRange: [0, heroCollapseScroll],
    outputRange: [heroBlockHeight, 0],
    extrapolate: 'clamp',
  });
  const headerTopPadding = scrollY.interpolate({
    inputRange: [0, heroCollapseScroll - 8, heroCollapseScroll],
    outputRange: [8, 8, heroTopInset + 8 - searchPanelStickyLift],
    extrapolate: 'clamp',
  });
  const webStickyTopPadding = scrollY.interpolate({
    inputRange: [0, Math.max(heroBlockHeight - heroTopInset, 1), heroBlockHeight],
    outputRange: [16, heroTopInset + 16, heroTopInset + 16 - searchPanelStickyLift],
    extrapolate: 'clamp',
  });
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
          zIndex: 20,
          overflow: 'hidden' as const,
        } as const)
      : ({
          zIndex: 10,
          elevation: 10,
          overflow: 'hidden' as const,
        } as const)),
  };

  const renderHomeSearchHeader = () => (
    <>
      <View className="px-6">
        <View
          className="flex-row items-center rounded-full px-4 py-2.5"
          style={filterSurfaceStyle}
        >
          <Ionicons name="search" size={18} color={FilterChipTheme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Sök restauranger, events, upplevelser"
            placeholderTextColor={FilterChipTheme.placeholder}
            className="flex-1"
            style={{ color: FilterChipTheme.text }}
            returnKeyType="search"
          />
          {searchQuery.trim() ? (
            <Pressable
              onPress={() => {
                setSearchQuery('');
                clearHomeSearchCache();
              }}
              className="ml-2 rounded-full px-2 py-1"
            >
              <Ionicons name="close-circle" size={18} color={FilterChipTheme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="mt-4">
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
    </>
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

        <View style={searchPanelStyle}>
          {Platform.OS === 'web' ? (
            <Animated.View
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
});
