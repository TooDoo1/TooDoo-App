import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Dimensions,
  Image,
  ImageSourcePropType,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Easing } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppReady } from '@/context/app-ready-context';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardMedia } from '@/components/ui/card-media';
import { haversineKm, formatDistanceKm, geocodeAddressCached, getUserCoords } from '@/lib/geo';
import { prefetchImageUris } from '@/lib/image-prefetch';
import { useFavorites } from '@/context/favorites-context';

const IMAGE_HYDRATE_CONCURRENCY = 5;

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';
const FEATURED_REPEAT_COUNT = 600;

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

type SectionItem = {
  id: string;
  categoryId: string;
  title: string;
  cards: CardItem[];
};

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
  const businessId =
    typeof order?.businessId === 'string'
      ? order.businessId
      : order?.businessId?.id ??
        order?.businessId?._id ??
        business?.id ??
        business?._id ??
        `business-${index}`;
  const orderId = String(order?.id ?? order?._id ?? `order-${index}`);

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
    id: String(businessId),
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
    erbjudandelängd: [order?.orderTimeTo ?? order?.validTo ?? ''],
  };
}

function SectionHeader({ title }: { title: string }) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-lg font-semibold" style={{ color: theme.text }}>{title}</Text>
      <Pressable>
        <Text style={{ color: theme.textMuted }}>Visa alla</Text>
      </Pressable>
    </View>
  );
}

function PromoCarousel({ images, activeIndex, theme }: { images: string[]; activeIndex: number; theme: ReturnType<typeof uiTheme> }) {
  const image = images[activeIndex % images.length];

  return (
    <View>
      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: theme.cardBg }}>
        <View className="relative h-36 w-full">
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <View className="absolute inset-0 bg-black/30" />
          <View className="absolute left-4 top-4">
            <Text className="text-2xl font-semibold" style={{ color: '#ffffff' }}>Sommarens</Text>
            <Text className="text-2xl font-semibold" style={{ color: '#ffffff' }}>deals</Text>
            <View className="mt-2 self-start rounded-full bg-[#ff3b30] px-3 py-1">
              <Text className="text-xs font-semibold text-white">-50%</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.dotsRow}>
        {images.map((_, idx) => (
          <View key={`promo-dot-${idx}`} style={idx === activeIndex ? styles.dotActive : styles.dot} />
        ))}
      </View>
    </View>
  );
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2 }}>
      <View className="flex-row gap-3 pb-2">
        {items.map((card, idx) => (
          <Pressable
            key={`${card.orderIds?.[0] ?? card.id}-${idx}`}
            className="overflow-hidden rounded-2xl"
            style={{
              position: 'relative',
              zIndex: 1000 - idx,
              elevation: 1000 - idx,
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
                      color={isFavorite(card.id) ? '#ff3b30' : '#ffffff'}
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

function computeDiscountLabel(card: CardItem): string | null {
  const priceArr = Array.isArray(card.erbjudandepris) ? card.erbjudandepris : [];
  const origArr = Array.isArray(card.erbjudandeoriginalpris) ? card.erbjudandeoriginalpris : [];
  const price = Number(priceArr[0]);
  const orig = Number(origArr[0]);
  if (!Number.isFinite(price) || !Number.isFinite(orig) || orig <= 0 || price >= orig) return null;
  const pct = Math.round(((orig - price) / orig) * 100);
  if (pct <= 0) return null;
  return `-${pct}%`;
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
  const offerLabel = Array.isArray(card.erbjudande) ? card.erbjudande[0] : card.erbjudande;
  return (
    <Pressable
      onPress={() => onPress?.(card)}
      className="overflow-hidden rounded-2xl"
      style={{ height, backgroundColor: '#000' }}
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
            style={{ backgroundColor: '#ff3b30' }}
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
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0b1a45', lineHeight: 16 }}>
                  {date.day}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#0b1a45', lineHeight: 11 }}>
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
      <Pressable onPress={onSeeAllPress} className="flex-row items-center" style={{ marginTop: 2 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Visa alla</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={{ marginLeft: 2 }} />
      </Pressable>
    </View>
  );
}

function QuickFiltersRow() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  const filters = [
    { id: 'tonight', label: 'Ikväll', icon: 'time-outline' as const },
    { id: 'budget', label: 'Under 200 kr', icon: 'cash-outline' as const },
    { id: 'outdoor', label: 'Utomhus', icon: 'leaf-outline' as const },
    { id: 'family', label: 'Barnvänligt', icon: 'people-outline' as const },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2 }}>
      <View className="flex-row gap-3">
        {filters.map((filter) => (
          <View
            key={filter.id}
            className="flex-row items-center rounded-full px-3 py-2"
            style={{ backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border }}
          >
            <Ionicons name={filter.icon} size={14} color={theme.textMuted} />
            <Text className="ml-2 text-xs" style={{ color: theme.textMuted }}>{filter.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function isLikelyPicsumUrl(uri: string) {
  return uri.includes('picsum.photos/');
}

const sliderImages = [
  'https://picsum.photos/id/1011/800/400',
  'https://picsum.photos/id/1015/800/400',
  'https://picsum.photos/id/1016/800/400',
];
const appLogo = require('../../assets/images/BgLogo.png');

export default function HomeScreen() {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES_ID);
  const [categoryFilters, setCategoryFilters] = useState<FilterCategory[]>([]);
  const [deals, setDeals] = useState<CardItem[]>([]);
  const [nearYouCards, setNearYouCards] = useState<CardItem[]>([]);
  const [hotOfferCards, setHotOfferCards] = useState<CardItem[]>([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<CardItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [firstName, setFirstName] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedSection, setExpandedSection] = useState<'nearby' | 'hot' | 'endingSoon' | null>(null);
  const nearbyAnim = useRef(new Animated.Value(0)).current;
  const hotAnim = useRef(new Animated.Value(0)).current;
  const endingSoonAnim = useRef(new Animated.Value(0)).current;
  const tooDooLetters = ['T', 'o', 'o', 'D', 'o', 'o'] as const;
  const tooDooColors = ['#ff4d6d', '#ff7a00', '#ffd60a', '#00d4ff', '#3a86ff', '#9b5de5'] as const;
  const tooDooBounceValues = useRef(tooDooLetters.map(() => new Animated.Value(0))).current;
  const didScrollAfterExpandRef = useRef(false);
  const didOpenCardRef = useRef(false);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const featuredScrollRef = useRef<any>(null);
  const featuredScrollX = useRef(new Animated.Value(0)).current;
  const [activeFeaturedDot, setActiveFeaturedDot] = useState(0);
  const activeFeaturedDotRef = useRef(0);
  const isInteracting = useRef(false);
  const lastInteractionTime = useRef(Date.now());
  const currentFeaturedIndex = useRef(0);
  const router = useRouter();
  const { markDataReady } = useAppReady();
  const { token } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { width: screenWidth } = Dimensions.get('window');
  // Decreased card width ratio to make side cards visibly occupy more space on screen
  const featuredCardWidth = Math.min(screenWidth * 0.68, 300);
  const featuredCardSpacing = 8;
  const featuredSnapInterval = featuredCardWidth + featuredCardSpacing;
  const featuredSidePadding = Math.max((screenWidth - featuredSnapInterval) / 2, 0);

  // Start the sticky transition only once the top "Hej" header is beginning to scroll away.
  // This avoids adding safe-area spacing too early (which looks like a big gap).
  const stickyStartY = Math.max(0, insets.top + 56);
  const stickyEndY = stickyStartY + 18;

  const stickyBgOpacity = scrollY.interpolate({
    inputRange: [stickyStartY, stickyEndY],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });


  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshNonce((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);


  useEffect(() => {
    const run = (value: Animated.Value, toValue: number) => {
      Animated.timing(value, {
        toValue,
        duration: 650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    run(nearbyAnim, expandedSection === 'nearby' ? 1 : 0);
    run(hotAnim, expandedSection === 'hot' ? 1 : 0);
    run(endingSoonAnim, expandedSection === 'endingSoon' ? 1 : 0);
  }, [expandedSection, nearbyAnim, hotAnim, endingSoonAnim]);

  useEffect(() => {
    if (!expandedSection) {
      return;
    }

    didScrollAfterExpandRef.current = false;
    didOpenCardRef.current = false;
    const current = expandedSection;
    const timer = setTimeout(() => {
      if (expandedSection === current && !didScrollAfterExpandRef.current && !didOpenCardRef.current) {
        setExpandedSection(null);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [expandedSection]);

  useFocusEffect(
    useCallback(() => {
      // Reset "opened card" tracking when returning to this screen.
      didOpenCardRef.current = false;
      // Play the same "bounce letters" feel as the login screen.
      tooDooBounceValues.forEach((value) => value.setValue(0));
      const bounceOneLetter = Animated.stagger(
        80,
        tooDooBounceValues.map((value) =>
          Animated.sequence([
            Animated.timing(value, { toValue: -10, duration: 140, useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 140, useNativeDriver: true }),
          ])
        )
      );
      bounceOneLetter.start();
      return () => {};
    }, [tooDooBounceValues])
  );

  const markExpandedSectionScrolled = () => {
    didScrollAfterExpandRef.current = true;
  };

  const repeatedFeaturedBusinesses = useMemo(() => {
    if (featuredBusinesses.length === 0) return [];
    // Repeat the featured businesses many times to create a seamless infinite loop
    return Array(FEATURED_REPEAT_COUNT).fill(featuredBusinesses).flat();
  }, [featuredBusinesses]);

  // Start perfectly in the middle of our massive array so users can comfortably manual-scroll left or right
  const INITIAL_INDEX =
    featuredBusinesses.length > 0 ? featuredBusinesses.length * Math.floor(FEATURED_REPEAT_COUNT / 2) : 0;

  const FEATURED_RECENTER_BUFFER = 10;

  const recenterFeaturedIndexIfNeeded = useCallback(
    (
      rawIndex: number,
      opts?: {
        animated?: boolean;
        applyScroll?: boolean;
      }
    ) => {
      const animated = opts?.animated ?? false;
      const applyScroll = opts?.applyScroll ?? true;
    const featuredCount = featuredBusinesses.length;
    if (featuredCount === 0) {
      return { index: rawIndex, didRecenter: false };
    }

    const listLength = repeatedFeaturedBusinesses.length;
    if (listLength === 0) {
      return { index: rawIndex, didRecenter: false };
    }

    const nearEnd = rawIndex >= listLength - FEATURED_RECENTER_BUFFER;
    const nearStart = rawIndex <= FEATURED_RECENTER_BUFFER;

    if (!nearEnd && !nearStart) {
      return { index: rawIndex, didRecenter: false };
    }

    // Snap to the equivalent position in the middle block for a seamless wrap.
    const wrappedIndex =
      INITIAL_INDEX + ((rawIndex % featuredCount) + featuredCount) % featuredCount;

    if (wrappedIndex !== rawIndex) {
      if (applyScroll) {
        featuredScrollRef.current?.scrollToOffset?.({
          offset: wrappedIndex * featuredSnapInterval,
          animated,
        });
      }

      return { index: wrappedIndex, didRecenter: true };
    }

    return { index: rawIndex, didRecenter: false };
    },
    [
      featuredBusinesses.length,
      INITIAL_INDEX,
      featuredSnapInterval,
      featuredSidePadding,
      repeatedFeaturedBusinesses.length,
    ]
  );

  useEffect(() => {
    if (featuredBusinesses.length === 0) {
      return;
    }

    if (currentFeaturedIndex.current === 0 && featuredBusinesses.length > 0) {
      currentFeaturedIndex.current = INITIAL_INDEX;
    }

    const timer = setInterval(() => {
      // Don't auto-scroll if the user is currently touching the screen
      if (isInteracting.current) return;
      // Don't auto-scroll until a few seconds after they let go
      if (Date.now() - lastInteractionTime.current < 4000) return;

      currentFeaturedIndex.current += 1;

      const { index: wrappedIndex, didRecenter } = recenterFeaturedIndexIfNeeded(currentFeaturedIndex.current);
      currentFeaturedIndex.current = wrappedIndex;

      if (didRecenter) return;

      const nextOffset = currentFeaturedIndex.current * featuredSnapInterval;
      
      // Use scrollToOffset to support FlatList
      if (featuredScrollRef.current?.scrollToOffset) {
        featuredScrollRef.current.scrollToOffset({ offset: nextOffset, animated: true });
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [featuredBusinesses.length, featuredSnapInterval, INITIAL_INDEX, repeatedFeaturedBusinesses.length, recenterFeaturedIndexIfNeeded]);

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

    const loadHomeData = async () => {
      setIsLoadingData(true);
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
          nearYouFromApi = parseOrdersPayload(closeJson)
            .filter((order) => isActiveOffer(order, nowMsForYou))
            .map(mapApiOrderToCardItem);
          hotFromApi = parseOrdersPayload(hotJson)
            .filter((order) => isActiveOffer(order, nowMsForYou))
            .map(mapApiOrderToCardItem);
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
          const offerEnd = visibleOrders.map((order) => order.orderTimeTo ?? order.validTo ?? '');
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
        const shuffledBusinesses = [...cards].sort(() => Math.random() - 0.5);
        const featuredList = shuffledBusinesses.slice(0, 5);

        const nextSections: SectionItem[] = apiCategoryFilters.map((category) => ({
          id: category.id,
          categoryId: category.id,
          title: category.label,
          cards: cards.filter((card) => card.categoryId === category.id),
        }));

        const filteredSections = nextSections.filter((section) => section.cards.length > 0);

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
          setFeaturedBusinesses(featuredList);
          currentFeaturedIndex.current =
            featuredList.length > 0 ? featuredList.length * Math.floor(FEATURED_REPEAT_COUNT / 2) : 0;
          setSections(filteredSections);

          void prefetchImageUris(
            [
              ...dealsList.slice(0, 12).map((c) => c.image),
              ...nearYouFromApi.slice(0, 6).map((c) => c.image),
              ...hotFromApi.slice(0, 6).map((c) => c.image),
              ...featuredList.slice(0, 4).map((c) => c.image),
            ],
            24
          );
        }

        // Background: for "Nära dig", geocode companies that lack coordinates
        // (using their address) so every card can show a real km distance, then
        // re-sort closest -> furthest. Cached so we only geocode each address once.
        if (coords) {
          void (async () => {
            const userCoords = coords;
            const needGeocode = dealsList.filter(
              (card) =>
                typeof card.distanceKm !== 'number' &&
                card.Adress &&
                card.Adress !== 'Adress saknas'
            );
            if (needGeocode.length === 0) return;

            const distanceByCardId = new Map<string, number>();
            for (const card of needGeocode) {
              const geo = await geocodeAddressCached(card.Adress);
              if (cancelled) return;
              if (geo) {
                distanceByCardId.set(
                  card.id,
                  haversineKm(userCoords.lat, userCoords.lng, geo.lat, geo.lng)
                );
              }
            }

            if (cancelled || distanceByCardId.size === 0) return;

            setDeals((prev) => {
              const merged = prev.map((card) => {
                const dist = distanceByCardId.get(card.id);
                return typeof dist === 'number' ? { ...card, distanceKm: dist } : card;
              });
              return [...merged].sort((a, b) => {
                const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
                const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
                if (da !== db) return da - db;
                return Number(b.deal) - Number(a.deal);
              });
            });
          })();
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
          setFeaturedBusinesses(patchCardImage);
          setSections((prev) =>
            prev.map((section) => ({ ...section, cards: patchCardImage(section.cards) }))
          );

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
          setFeaturedBusinesses([]);
          setSections([]);
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
  }, [markDataReady, refreshNonce, token, coords]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setFirstName(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const res = await fetch(apiUrl('/user/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) {
          setFirstName(typeof json?.firstName === 'string' ? json.firstName : null);
        }
      } catch {
        if (!cancelled) setFirstName(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredSections = useMemo(() => {
    if (activeCategory === ALL_CATEGORIES_ID) {
      return sections;
    }

    if (activeCategory === OFFERS_CATEGORY_ID) {
      return [];
    }

    return sections.filter((section) => section.categoryId === activeCategory);
  }, [activeCategory, sections]);

  const filteredDeals = useMemo(() => {
    if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
      return deals;
    }

    return deals.filter((card) => card.categoryId === activeCategory);
  }, [activeCategory, deals]);

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

    const getIconName = (label: string): React.ComponentProps<typeof Ionicons>['name'] => {
      const name = label.toLowerCase();
      if (name.includes('erbjud')) return 'pricetag-outline';
      if (name.includes('mat') || name.includes('food') || name.includes('restaur')) return 'restaurant-outline';
      if (name.includes('event') || name.includes('evenemang')) return 'calendar-outline';
      if (name.includes('familj') || name.includes('family') || name.includes('barn')) return 'people-outline';
      if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) return 'football-outline';
      if (name.includes('hälsa') || name.includes('health')) return 'heart-outline';
      if (name.includes('skön') || name.includes('beauty') || name.includes('spa')) return 'sparkles-outline';
      if (name.includes('nöje') || name.includes('entertain') || name.includes('bio')) return 'film-outline';
      if (name.includes('kläder') || name.includes('shopping') || name.includes('butik')) return 'bag-outline';
      if (name.includes('resa') || name.includes('travel')) return 'airplane-outline';
      return 'grid-outline';
    };

    return pool.map((cat) => ({ ...cat, icon: getIconName(cat.label) }));
  }, [categoryOptions]);

  useEffect(() => {
    if (!categoryOptions.some((category) => category.id === activeCategory)) {
      setActiveCategory(ALL_CATEGORIES_ID);
    }
  }, [activeCategory, categoryOptions]);

  const featuredBusiness = featuredBusinesses.length > 0
    ? featuredBusinesses[currentFeaturedIndex.current % featuredBusinesses.length]
    : undefined;

  const isSectionEnlarged = useCallback((sectionTitle: string) => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const name = sectionTitle.toLowerCase();

    if (name.includes('food') || name.includes('mat') || name.includes('restaurang')) {
      return hour >= 11 && hour < 13;
    }
    if (name.includes('entertainment') || name.includes('underhållning') || name.includes('family') || name.includes('familj')) {
      return day === 5 || day === 6; // Friday or Saturday
    }
    if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) {
      return hour >= 15;
    }
    if (name.includes('shop') || name.includes('shopping') || name.includes('butik')) {
      return (day === 0 || day === 6) && hour >= 11 && hour < 16; // Sat/Sun 11-16
    }
    return false;
  }, []);

  const searchedDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredDeals;
    return filteredDeals.filter((card) => {
      const hay = `${card.title} ${card.kortbeskrivning} ${card.långbeskrivning}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filteredDeals, searchQuery]);

  const getCategoryIconName = (label: string): React.ComponentProps<typeof Ionicons>['name'] => {
    const name = label.toLowerCase();
    if (name.includes('mat') || name.includes('food') || name.includes('restaur')) return 'restaurant-outline';
    if (name.includes('familj') || name.includes('family') || name.includes('barn')) return 'people-outline';
    if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) return 'football-outline';
    if (name.includes('hälsa') || name.includes('health')) return 'heart-outline';
    if (name.includes('skön') || name.includes('beauty') || name.includes('spa')) return 'sparkles-outline';
    if (name.includes('nöje') || name.includes('entertain') || name.includes('bio')) return 'film-outline';
    if (name.includes('kläder') || name.includes('shopping') || name.includes('butik')) return 'bag-outline';
    if (name.includes('resa') || name.includes('travel')) return 'airplane-outline';
    return 'grid-outline';
  };

  const handleCardPress = (card: CardItem) => {
    didOpenCardRef.current = true;
    const encodeListParam = (value: string | string[] | number | number[] | Date | Date[] | undefined) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (Array.isArray(value)) {
        return JSON.stringify(
          value.map((item) => (item instanceof Date ? item.toISOString() : String(item)))
        );
      }

      return value instanceof Date ? value.toISOString() : String(value);
    };

    const remoteImageUri =
      typeof card.image === 'object' && card.image && 'uri' in card.image && typeof card.image.uri === 'string'
        ? card.image.uri
        : '';

    router.push({
      pathname: '/(tabs)/Erbjudanden',
      params: {
        mapResetNonce: `${Date.now()}-${Math.random()}`,
        id: card.id,
        claimBusinessId: card.id,
        title: card.title,
        deal: card.deal ? '1' : '0',
        imageUri: remoteImageUri,
        Adress: card.Adress,
        latitude: card.latitude?.toString(),
        longitude: card.longitude?.toString(),
        Telefon: card.Telefon ?? '+46 42-10 00 00',
        Website: card.Website,
        kortbeskrivning: card.kortbeskrivning,
        långbeskrivning: card.långbeskrivning,
        erbjudande: encodeListParam(card.erbjudande),
        orderIds: encodeListParam(card.orderIds),
        erbjudandepris: encodeListParam(card.erbjudandepris),
        erbjudandeoriginalpris: encodeListParam(card.erbjudandeoriginalpris),
        erbjudandeclaimade: encodeListParam(card.erbjudandeclaimade),
        erbjudandemängd: encodeListParam(card.erbjudandemängd),
        erbjudandelängd: encodeListParam(card.erbjudandelängd),
      },
    });
  };

  const setExpandedSectionAnimated = (next: typeof expandedSection) => setExpandedSection(next);

  const handleNearbyCardPress = (card: CardItem) => {
    if (expandedSection !== 'nearby') {
      setExpandedSectionAnimated('nearby');
      return;
    }
    handleCardPress(card);
  };

  const handleHotCardPress = (card: CardItem) => {
    if (expandedSection !== 'hot') {
      setExpandedSectionAnimated('hot');
      return;
    }
    handleCardPress(card);
  };

  const handleEndingSoonCardPress = (card: CardItem) => {
    if (expandedSection !== 'endingSoon') {
      setExpandedSectionAnimated('endingSoon');
      return;
    }
    handleCardPress(card);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
      <SafeAreaView
        edges={['left', 'right']}
        className="flex-1"
        style={[styles.screen, { backgroundColor: 'transparent' }]}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          stickyHeaderIndices={[0]}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
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
        <View
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,11,42,0.10)',
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={theme.isDark ? ['#0b1a45', '#0b1a45'] : ['#f5f7ff', '#f5f7ff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ paddingTop: insets.top + 4, paddingBottom: 10 }}
          >
            {(() => {
              const collapse = scrollY.interpolate({
                inputRange: [0, 70],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              });
              const greetingHeight = collapse.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 36],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View style={{ height: greetingHeight, opacity: collapse, overflow: 'hidden' }}>
                  <View
                    style={{
                      paddingLeft: 24,
                      paddingTop: 0,
                      paddingBottom: 0,
                      paddingRight: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text className="text-xl font-semibold" style={{ color: theme.text, textAlign: 'center' }}>
                      Vad vill du göra idag?
                    </Text>
                  </View>
                </Animated.View>
              );
            })()}

            <View className="px-6" style={{ marginTop: -2 }}>
              <View
                className="flex-row items-center rounded-full px-4 py-2.5"
                style={{
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,11,42,0.25)',
                  backgroundColor: theme.cardBg,
                }}
              >
                <Ionicons name="search" size={18} color={theme.text} style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Sök restauranger, events, upplevelser"
                  placeholderTextColor={theme.textFaint}
                  className="flex-1"
                  style={{ color: theme.text }}
                  returnKeyType="search"
                />
                {searchQuery.trim() ? (
                  <Pressable onPress={() => setSearchQuery('')} className="ml-2 rounded-full px-2 py-1">
                    <Ionicons name="close-circle" size={18} color={theme.text} />
                  </Pressable>
                ) : null}
                <Pressable className="ml-1 rounded-full p-1">
                  <Ionicons name="options-outline" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View className="mt-4">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
                <View className="flex-row gap-2">
                  {quickCategories.map((cat) => (
                    (() => {
                      const getAccent = () => {
                        // Make "Erbjudanden" stand out with orange.
                        if (cat.id === OFFERS_CATEGORY_ID || cat.label.toLowerCase().includes('erbjud')) return '#ff7a00';
                        // Otherwise, pick a stable accent based on icon.
                        switch (cat.icon) {
                          case 'restaurant-outline':
                            return '#34c759';
                          case 'calendar-outline':
                            return '#ff3b30';
                          case 'film-outline':
                          case 'sparkles-outline':
                            return '#af52de';
                          case 'people-outline':
                            return '#0a84ff';
                          case 'football-outline':
                            return '#32ade6';
                          case 'heart-outline':
                            return '#ff2d55';
                          case 'bag-outline':
                            return '#ffd60a';
                          case 'airplane-outline':
                            return '#64d2ff';
                          default:
                            return '#9b5de5';
                        }
                      };

                      const accent = getAccent();
                      const isActive = activeCategory === cat.id;

                      return (
                    <Pressable
                      key={cat.id}
                      onPress={() =>
                        setActiveCategory((prev) => (prev === cat.id ? ALL_CATEGORIES_ID : cat.id))
                      }
                      className="flex-row items-center rounded-full px-3 py-2"
                      style={{
                        backgroundColor: isActive ? `${accent}22` : theme.cardBg,
                        borderColor: accent,
                        borderWidth: 1,
                      }}
                    >
                      <Ionicons name={cat.icon} size={14} color={isActive ? accent : theme.textMuted} />
                      <Text className="ml-2 text-xs" style={{ color: isActive ? accent : theme.textMuted }}>
                        {cat.label}
                      </Text>
                    </Pressable>
                      );
                    })()
                  ))}
                </View>
              </ScrollView>
            </View>
          </LinearGradient>
        </View>

        <View className="mt-6 px-6">
          <SectionTitleRow
            title="Nära dig"
            icon="navigate"
            iconColor="#ff3b30"
            onSeeAllPress={() => router.push('/(tabs)/NaraDig')}
          />
          {isLoadingData && filteredDeals.length === 0 ? (
            <Text style={{ color: theme.textMuted }}>Laddar...</Text>
          ) : (
            <ForYouOrderCarousel
              cards={filteredDeals}
              onCardPress={handleCardPress}
              badgeLabel="Nära dig"
              badgeColor="rgba(0,11,42,0.75)"
              getBadgeLabel={getNearbyBadge}
              showFavoriteButton
              emptyText="Inga erbjudanden nära dig just nu."
            />
          )}
        </View>

        <View className="mt-6 px-6">
          <SectionTitleRow
            title="Heta erbjudanden"
            icon="flame"
            iconColor="#ff3b30"
            subtitle="Baserat på dina intressen"
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

        <View className="mt-6 px-6">
          <SectionTitleRow
            title="Slutar snart"
            icon="hourglass-outline"
            subtitle="Baserat på dina intressen"
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

        <View className="mt-4 px-6">
          <QuickFiltersRow />
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000b2a',
  },
  scroll: {
    flex: 1,
  },
  sliderContainer: {
    height: 240,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  sliderImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ff3b30',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  featuredCardClip: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  featuredCardImage: {
    width: '100%',
    height: '100%',
  },
});

function CardRow({ cards, onCardPress, enlarged }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void; enlarged?: boolean }) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  if (enlarged) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 pb-2">
          {cards.map((card, index) => (
            <View
              key={`${card.id}-${index}-shadow`}
              style={{
                shadowColor: '#000',
                shadowOpacity: theme.isDark ? 0.22 : 0.14,
                shadowRadius: theme.isDark ? 14 : 12,
                shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
                elevation: theme.isDark ? 6 : 4,
              }}
            >
              <Pressable
                key={`${card.id}-${index}`}
                className="w-64 overflow-hidden rounded-2xl"
                style={{
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
                }}
                onPress={() => onCardPress?.(card)}
              >
              <View className="relative h-44 w-full">
                <CardMedia source={card.image} svgFit="fill" priority={index < 4 ? 'high' : 'normal'} />
                <View className="absolute inset-0 bg-black/20" />
                {card.deal ? <DealTag /> : null}
                <View className="absolute bottom-0 left-0 right-0 p-3">
                  <View className="rounded-xl bg-black/50 px-3 py-2">
                    <Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={1}>{card.title}</Text>
                    <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                      {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                    </Text>
                  </View>
                </View>
              </View>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-3 pb-2">
        {cards.map((card, index) => (
          <View
            key={`${card.id}-${index}-shadow`}
            style={{
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              key={`${card.id}-${index}`}
              className="w-40 overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(card)}
            >
              <View className="relative h-28 w-full">
                <CardMedia source={card.image} svgFit="fill" priority={index < 4 ? 'high' : 'normal'} />
                {card.deal ? <DealTag /> : null}
              </View>
              <Text className="px-2 py-2 text-sm" style={{ color: theme.text }}>{card.title}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function CardGrid({ cards, onCardPress }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void }) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const elements: React.ReactNode[] = [];
  let i = 0;
  let smallCount = 0;

  while (i < cards.length) {
    if (smallCount > 0 && smallCount % 8 === 0) {
      const card = cards[i];
      elements.push(
          <View
            key={`${card.id}-${i}-large-shadow`}
            style={{
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              key={`${card.id}-${i}-large`}
              className="mb-3 w-full overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(card)}
            >
              <View className="relative h-52 w-full">
                <CardMedia source={card.image} svgFit="fill" priority={i < 4 ? 'high' : 'normal'} />
                <View className="absolute inset-0 bg-black/20" />
                {card.deal ? <DealTag /> : null}
                <View className="absolute bottom-0 left-0 right-0 p-3">
                  <View className="rounded-xl bg-black/50 px-3 py-2">
                    <Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={1}>
                      {card.title}
                    </Text>
                    <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                      {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
      );
      i += 1;
      smallCount = 0;
      continue;
    }

    const left = cards[i];
    const right = i + 1 < cards.length ? cards[i + 1] : null;

    elements.push(
      <View key={`row-${i}`} className="mb-3 flex-row gap-3">
        <View
          style={{
            flex: 1,
            shadowColor: '#000',
            shadowOpacity: theme.isDark ? 0.22 : 0.14,
            shadowRadius: theme.isDark ? 14 : 12,
            shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
            elevation: theme.isDark ? 6 : 4,
          }}
        >
          <Pressable
            className="flex-1 overflow-hidden rounded-2xl"
            style={{
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
            }}
            onPress={() => onCardPress?.(left)}
          >
            <View className="relative h-28 w-full">
              <CardMedia source={left.image} svgFit="fill" />
              {left.deal ? <DealTag /> : null}
            </View>
            <Text className="px-2 py-2 text-sm" style={{ color: theme.text }} numberOfLines={1}>{left.title}</Text>
          </Pressable>
        </View>

        {right ? (
          <View
            style={{
              flex: 1,
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              className="flex-1 overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(right)}
            >
              <View className="relative h-28 w-full">
                <CardMedia source={right.image} svgFit="fill" />
                {right.deal ? <DealTag /> : null}
              </View>
              <Text className="px-2 py-2 text-sm" style={{ color: theme.text }} numberOfLines={1}>{right.title}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1" />
        )}
      </View>
    );

    smallCount += right ? 2 : 1;
    i += right ? 2 : 1;
  }

  return <View>{elements}</View>;
}

function DealTag() {
  const wobble = useRef(new Animated.Value(0)).current;
  const rotate = wobble.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  useEffect(() => {
    const wobbleAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(wobble, { toValue: -1, duration: 110, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -0.6, duration: 100, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0.6, duration: 100, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 100, useNativeDriver: true }),
      ])
    );

    wobbleAnimation.start();

    return () => {
      wobbleAnimation.stop();
      wobble.setValue(0);
    };
  }, [wobble]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        borderRadius: 999,
        backgroundColor: '#ff3b30',
        paddingHorizontal: 8,
        paddingVertical: 2,
        transform: [{ rotate }],
      }}
    >
      <Text className="text-[10px] font-medium text-white">Erbjudande</Text>
    </Animated.View>
  );
}
