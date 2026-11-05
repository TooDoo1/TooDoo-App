import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  InteractionManager,
  Modal,
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
} from '@/components/floating-tab-bar';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppReady } from '@/context/app-ready-context';
import { fetchApprovedBusinessesCatalog, invalidateCatalogCache } from '@/lib/catalog-cache';
import { apiUrl } from '@/lib/api';
import {
  isBusinessOpenNow,
  normalizeBusinessOpeningHours,
} from '@/lib/business-opening-hours';
import { useAuth } from '@/context/auth-context';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { InlineMicButton } from '@/components/inline-mic-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useHeroTopInset } from '@/lib/use-hero-top-inset';
import {
  HOME_PAGE_PAD,
  HOME_RADIUS,
  HomeCardGrid,
  HomeDealTile,
  HomeEventTickets,
  HomePosterCarousel,
  HomeRecentCompanies,
  HomeSectionHeader,
} from '@/components/home/home-feed';
import {
  DEFAULT_EXPLORE_FILTERS,
  ExploreFilterPanel,
  type ExploreFilterState,
} from '@/components/home/explore-filter-panel';
import {
  HOME_TIP_STRIP_HEIGHT,
  type HomeTipCard,
} from '@/components/home/home-tip-cards';
import { useThemePreference } from '@/context/theme-preference-context';
import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { BrandColors, brandInkRgba, FilterChipTheme } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCityImageUris, peekCityImageUris } from '@/lib/city-images';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import {
  applyHaversineDistances,
  fillMissingDistancesFromAddresses,
  formatDistanceKm,
  geocodeAddressCached,
  getEffectiveUserCoordsIfGranted,
  getUserCoords,
  getUserCoordsIfGranted,
  HELSINGBORG_COORDS,
  isPlausibleSwedenCoordinate,
  peekGeocodeCache,
} from '@/lib/geo';
import {
  loadCustomLocationsState,
  setActiveCustomLocationId,
  subscribeCustomLocations,
  type CustomLocationsState,
} from '@/lib/custom-locations';
import {
  loadRegionSelection,
  setRegionSelection,
  subscribeRegionSelection,
  type RegionSelection,
} from '@/lib/region-selection';
import { staticCoordsForCity } from '@/lib/sweden-city-coords';
import {
  SWEDEN_REGIONS,
  findLanByName,
  geocodeQueryForCity,
} from '@/lib/sweden-regions';
import {
  EVENT_FEED_DAYS,
  HOME_EVENT_TICKET_COUNT,
  fetchEventFeed,
  resolveEventFeedCity,
  type EventFeedItem,
} from '@/lib/events-feed';
import { openEventFeedItem } from '@/lib/open-event-feed';
import { openOfferDetail } from '@/lib/open-offer-detail';
import {
  BUSINESS_MAP_PATH,
  EVENEMANG_PATH,
  HETA_ERBJUDANDEN_PATH,
  NARA_DIG_PATH,
  SEARCH_RESULTS_PATH,
} from '@/lib/stack-navigation';
import { settleHomeScreenAssetsWithinBudget } from '@/lib/warm-home-screen';
import {
  getCategoryAccentColor,
  getCategoryIconName,
  getOnAccentTextColor,
  OFFERS_CATEGORY_ACCENT,
} from '@/lib/category-colors';
import {
  cardMatchesCategory,
  cardsFromCatalogBusinesses,
  fetchHomeScreenData,
  resolveBusinessCategoryIds,
  resolveBusinessCategoryNames,
  resolveBusinessIdFromOrder,
  resolveBusinessSubcategoryName,
  type OfferCardItem,
} from '@/lib/home-offers';
import {
  clearHomeSearchCache,
  getHomeEventsCache,
  getHomeEventsCacheCity,
  getHomeKnownOfferCards,
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
import { consumeOpenHomeSearch } from '@/lib/home-search-handoff';
import {
  searchCatalog,
  searchNatural,
  sortSearchResultsHot,
  sortSearchResultsNearYou,
} from '@/lib/catalog-search';
import {
  fetchRecentBusinesses,
  resetRecentCompanyBaseline,
  type RecentCompanyCard,
} from '@/lib/recent-businesses';
import {
  fetchRecommendedNow,
  getRecommendedNowMoment,
  pickRecommendedNowCards,
} from '@/lib/recommended-now';
import {
  getSpeechSupportInfo,
  startSpeechToText,
  type SpeechToTextSession,
} from '@/lib/speech-to-text';
import { playMicCue } from '@/lib/mic-cues';
import { showAlert } from '@/lib/show-alert';
import {
  DEFAULT_SEARCH_TIPS,
  EMPTY_SEARCH_TIPS_TAKE,
  fetchSearchTips,
  getLocalBusinessSearchTips,
  mergeSearchTips,
  SEARCH_SHOP_TIPS_TAKE,
  splitSearchTips,
  type SearchTipItem,
} from '@/lib/search-tips';
import {
  fetchPopularSearches,
  loadLocalRecentSearches,
  persistLocalRecentSearches,
  prependLocalRecentSearch,
} from '@/lib/search-history';

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';
/** Home feed sections rendered after the spotlight rows. */
const AFTER_SHOPPING_HINTS: Array<{
  hints: string[];
  fallbackId: string;
  fallbackLabel: string;
}> = [
  { hints: ['kultur'], fallbackId: 'kultur', fallbackLabel: 'Kultur' },
  { hints: ['nöje', 'noje'], fallbackId: 'noje', fallbackLabel: 'Nöje' },
];

function isAfterShoppingLabel(label: string) {
  const normalized = label.trim().toLocaleLowerCase('sv-SE');
  return AFTER_SHOPPING_HINTS.some((entry) =>
    entry.hints.some((hint) => normalized.includes(hint))
  );
}

const SEARCH_DROPDOWN_OPEN_MS = 220;
const SEARCH_DROPDOWN_CLOSE_MS = 240;
const SEARCH_TIPS_DEBOUNCE_MS = 120;
const SEARCH_BAR_HEIGHT = 44;
/**
 * Native: pull chrome slightly into the status area for a tighter top.
 * Web: chrome uses measured safe-area only (no invented island gap).
 */
const HOME_NAV_EXTRA_TOP = Platform.OS === 'web' ? 0 : -8;
/**
 * Keep the hero photo frame tall even when safe-area is 0 (desktop / RDM).
 * Without this, inset→0 shrinks the image box and the photo looks squeezed.
 */
const HOME_HERO_PHOTO_BLEED = 54;
/** Collapsing discovery hero above sticky search (location overlays the hero). */
const HOME_GREETING_HEIGHT = HOME_TIP_STRIP_HEIGHT;
/** Shared mesh artwork height (status + greeting + search). */
const HOME_HEADER_MESH_SIZE = 280;
/** Shared header chrome: back | search | map — equal side padding + gaps so the trio is centered. */
const SEARCH_OVERLAY_SIDE_PAD = 12;
const SEARCH_OVERLAY_MAP_BUTTON_GAP = 8;
const SEARCH_OVERLAY_MAP_BUTTON_SIZE = SEARCH_BAR_HEIGHT;
const SEARCH_OVERLAY_BACK_SIZE = SEARCH_BAR_HEIGHT;
const SEARCH_DROPDOWN_MAX_HEIGHT = 380;
/** 0–1: where on the search bar the fade begins (0.5 = halfway down the bar). */
const SEARCH_DROPDOWN_DISAPPEAR_RATIO = 0.5;
const SEARCH_DROPDOWN_OPEN_EASING = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const SEARCH_DROPDOWN_CLOSE_EASING = ReanimatedEasing.bezier(0.4, 0, 0.2, 1);
/** Full-screen search fly-up — short + transform-only to avoid layout lag. */
const SEARCH_OVERLAY_OPEN_MS = 200;
const SEARCH_OVERLAY_CLOSE_MS = 160;
const SEARCH_OVERLAY_OPEN_EASING = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const SEARCH_OVERLAY_CLOSE_EASING = ReanimatedEasing.bezier(0.4, 0.0, 0.2, 1);

type CardItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  categoryId?: string;
  categoryIds?: string[];
  categoryName?: string;
  categoryNames?: string[];
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
  openingHours?: unknown;
  resultKind?: 'business' | 'event';
  eventSource?: 'MUNICIPIO' | 'VISIT_SWEDEN' | 'BUSINESS';
};

function filterCardsByActiveCategory(cards: CardItem[], activeCategory: string): CardItem[] {
  if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
    return cards;
  }

  return cards.filter((card) => cardMatchesCategory(card, activeCategory));
}

const SEARCH_TIP_PREVIEW_LIMIT = 2;

function getSearchTipKey(tip: SearchTipItem) {
  return `${tip.kind}:${tip.id ?? tip.label.trim().toLocaleLowerCase('sv-SE')}`;
}

function uniqueCardsById(cards: CardItem[]): CardItem[] {
  const seen = new Set<string>();
  const result: CardItem[] = [];
  for (const card of cards) {
    if (!card?.id || seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
  }
  return result;
}

const EXPLORE_PAGE_SIZE = 12;
const SEARCH_PAGE_SIZE = 24;

function shuffleCards<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function businessHasSubcategoryId(business: any, subcategoryId: string): boolean {
  const want = String(subcategoryId ?? '').trim();
  if (!want) return true;
  const categories = Array.isArray(business?.categories) ? business.categories : [];
  for (const category of categories) {
    const children = Array.isArray(category?.subcategories) ? category.subcategories : [];
    for (const child of children) {
      if (String(child?.id ?? '').trim() === want) return true;
    }
  }
  return false;
}

const WEEKEND_CATEGORY_HINTS = [
  'nöje',
  'noje',
  'familj',
  'sport',
  'kultur',
  'upplevelse',
  'barn',
  'musik',
  'bio',
  'aktivitet',
];
const WEEKEND_TEXT_HINTS = [
  'helg',
  'weekend',
  'lördag',
  'söndag',
  'lordag',
  'sondag',
  'fredag',
  'fredags',
];

function cardSearchHaystack(card: CardItem): string {
  return [card.title, card.categoryName, card.kortbeskrivning, card.erbjudande]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('sv-SE');
}

function stockholmWeekday(date: Date): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    weekday: 'short',
  }).format(date);
  switch (label) {
    case 'Mon':
      return 1;
    case 'Tue':
      return 2;
    case 'Wed':
      return 3;
    case 'Thu':
      return 4;
    case 'Fri':
      return 5;
    case 'Sat':
      return 6;
    case 'Sun':
      return 7;
    default:
      return date.getDay() === 0 ? 7 : date.getDay();
  }
}

/** Fri–Sun within the next ~9 days (this or next weekend). */
function isComingWeekendMoment(iso: string, now = new Date()): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  if (ms < now.getTime() - 3 * 60 * 60 * 1000) return false;
  const daysAhead = (ms - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysAhead > 9) return false;
  const weekday = stockholmWeekday(new Date(ms));
  return weekday >= 5;
}

function scoreWeekendCard(
  card: CardItem,
  leisureCategoryIds: string[]
): number {
  const hay = cardSearchHaystack(card);
  const category = (card.categoryName ?? '').toLocaleLowerCase('sv-SE');
  let score = 0;
  if (WEEKEND_TEXT_HINTS.some((key) => hay.includes(key))) score += 8;
  if (leisureCategoryIds.some((id) => cardMatchesCategory(card, id))) score += 5;
  if (WEEKEND_CATEGORY_HINTS.some((hint) => category.includes(hint))) score += 4;
  if (card.deal) score += 1;
  return score;
}

function eventFeedItemToCard(event: EventFeedItem): CardItem {
  const isBusiness = event.source === 'business';
  const id = isBusiness
    ? String(event.businessEvent?.id ?? event.id.replace(/^business:/, ''))
    : String(event.municipioEvent?.id ?? event.id.replace(/^municipio:/, ''));
  const image =
    event.image ??
    ({
      uri: `https://picsum.photos/seed/${encodeURIComponent(`weekend-event-${id}`)}/300/200`,
    } as const);

  return {
    id,
    resultKind: 'event',
    eventSource: isBusiness ? 'BUSINESS' : 'MUNICIPIO',
    title: event.title,
    image,
    categoryId: event.categoryId,
    categoryName: event.categoryName ?? 'Evenemang',
    deal: false,
    orderIds: [],
    Adress: event.subtitle || 'Evenemang',
    Website: '',
    kortbeskrivning: event.subtitle || 'Evenemang',
    långbeskrivning: '',
    latitude: event.latitude,
    longitude: event.longitude,
  };
}

/** Round-robin merge so events and companies alternate instead of clustering. */
function interleaveCardLists(lists: CardItem[][], limit = 10): CardItem[] {
  const cursors = lists.map(() => 0);
  const result: CardItem[] = [];
  const seen = new Set<string>();
  let progressed = true;

  while (progressed && result.length < limit) {
    progressed = false;
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      while (cursors[i] < list.length) {
        const card = list[cursors[i]++];
        if (!card?.id || seen.has(card.id)) continue;
        seen.add(card.id);
        result.push(card);
        progressed = true;
        break;
      }
      if (result.length >= limit) break;
    }
  }

  return result;
}

function matchCardsToSearchTip(
  cards: CardItem[],
  tip: SearchTipItem,
  categories: Array<{ id: string; label: string }> = []
): CardItem[] {
  const matched: CardItem[] = [];

  if (tip.id) {
    const byId = cards.find((card) => card.id === tip.id);
    if (byId) matched.push(byId);
  }

  const q = tip.label.trim().toLocaleLowerCase('sv-SE');
  if (!q) return matched.slice(0, SEARCH_TIP_PREVIEW_LIMIT);

  const category = categories.find(
    (item) => item.label.trim().toLocaleLowerCase('sv-SE') === q
  );
  if (category) {
    for (const card of cards) {
      if (matched.some((item) => item.id === card.id)) continue;
      if (card.resultKind === 'event') continue;
      if (!cardMatchesCategory(card, category.id)) continue;
      matched.push(card);
      if (matched.length >= SEARCH_TIP_PREVIEW_LIMIT) break;
    }
    if (matched.length > 0) return matched.slice(0, SEARCH_TIP_PREVIEW_LIMIT);
  }

  for (const card of cards) {
    if (matched.some((item) => item.id === card.id)) continue;
    if (card.resultKind === 'event') continue;
    const hay = [card.title, card.categoryName, card.kortbeskrivning, card.Adress]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('sv-SE');
    if (!hay.includes(q)) continue;
    matched.push(card);
    if (matched.length >= SEARCH_TIP_PREVIEW_LIMIT) break;
  }

  return matched.slice(0, SEARCH_TIP_PREVIEW_LIMIT);
}

function sameCoords(
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
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
  if (card.resultKind === 'event') return 'Evenemang';
  return formatDistanceKm(card.distanceKm) ?? 'Nära dig';
}

function getSearchResultBadge(card: CardItem) {
  if (card.resultKind === 'event') return 'Evenemang';
  return 'Träff';
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
    categoryNames: resolveBusinessCategoryNames(business),
    subcategoryName: resolveBusinessSubcategoryName(business),
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
    openingHours: business?.openingHours,
  };
}

function ForYouOrderCarousel(props: Parameters<typeof HomePosterCarousel>[0]) {
  return <HomePosterCarousel {...props} />;
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
  return (
    <HomeDealTile
      card={card}
      onPress={onPress}
      height={height}
      titleSize={titleSize}
      variant="overlay"
    />
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
  const smallHeight = (largeHeight - 10) / 2;

  return (
    <View className="flex-row" style={{ gap: 10 }}>
      <View style={{ flex: 1.15 }}>
        <FeaturedDealCard card={big} onPress={onCardPress} height={largeHeight} titleSize="lg" />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
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
  return (
    <HomeDealTile card={card} onPress={onPress} titleSize={titleSize} variant="overlay" />
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

const HOME_HEADER_HERO_FALLBACK = require('../../assets/images/helsingborg-hero.png');
const HOME_HERO_ROTATE_MS = 7000;

/**
 * Full-bleed city photo behind the greeting chrome only.
 * Stacks up to 3 URLs and opacity-fades between them. Web uses plain <img> + CSS
 * so swaps paint without a touch; native uses ExpoImage layers.
 */
function HomeHeaderHeroFill({
  fadeTo,
  imageUris = [],
  onActiveIndexChange,
}: {
  fadeTo: string;
  imageUris?: string[];
  onActiveIndexChange?: (index: number) => void;
  shift?: number;
  section?: 'top' | 'search';
}) {
  const [index, setIndex] = useState(0);
  const uris = useMemo(
    () => imageUris.filter(Boolean).slice(0, 3),
    [imageUris]
  );
  const uriKey = uris.join('|');
  const slides = uris.length > 0 ? uris : ([null] as (string | null)[]);

  useEffect(() => {
    setIndex(0);
  }, [uriKey]);

  useEffect(() => {
    onActiveIndexChange?.(index);
  }, [index, onActiveIndexChange]);

  useEffect(() => {
    if (slides.length <= 1 || (slides.length === 1 && slides[0] == null)) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, HOME_HERO_ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length, uriKey]);

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', backgroundColor: fadeTo }]}
    >
      {slides.map((uri, i) => {
        const active = i === index % slides.length;
        if (Platform.OS === 'web') {
          if (!uri) {
            return (
              <Image
                key={`fallback-${i}`}
                source={HOME_HEADER_HERO_FALLBACK}
                resizeMode="cover"
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    opacity: active ? 1 : 0,
                    // @ts-expect-error web CSS
                    transition: 'opacity 480ms ease',
                  },
                ]}
              />
            );
          }
          return (
            // @ts-expect-error web-only element
            <img
              key={uri}
              src={uri}
              alt=""
              className="home-hero-photo-img"
              draggable={false}
              decoding="async"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center top',
                opacity: active ? 1 : 0,
                transition: 'opacity 480ms ease',
                pointerEvents: 'none',
                willChange: 'opacity',
              }}
            />
          );
        }

        return (
          <ExpoImage
            key={uri ?? `fallback-${i}`}
            source={uri ? { uri } : HOME_HEADER_HERO_FALLBACK}
            contentFit="cover"
            contentPosition="top center"
            cachePolicy="memory-disk"
            transition={450}
            style={[StyleSheet.absoluteFillObject, { opacity: active ? 1 : 0 }]}
          />
        );
      })}
      <LinearGradient
        colors={[
          'rgba(8,12,22,0.18)',
          'rgba(8,12,22,0.12)',
          'rgba(8,12,22,0.42)',
          fadeTo,
          fadeTo,
        ]}
        locations={[0, 0.35, 0.62, 0.88, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

function SectionTitleRow({
  title,
  subtitle,
  onSeeAllPress,
  kicker,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  subtitle?: string;
  onSeeAllPress?: () => void;
  kicker?: string;
}) {
  return (
    <HomeSectionHeader
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      onSeeAllPress={onSeeAllPress}
    />
  );
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
  const [searchHasMore, setSearchHasMore] = useState(
    () => (initialSearch.results?.length ?? 0) >= SEARCH_PAGE_SIZE
  );
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [searchCommitted, setSearchCommitted] = useState(
    () => initialSearch.query.trim().length >= 2
  );
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
  const [searchTips, setSearchTips] = useState<SearchTipItem[]>(
    DEFAULT_SEARCH_TIPS.map((label) => ({ label, kind: 'tip' as const }))
  );
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<SearchTipItem[]>(
    DEFAULT_SEARCH_TIPS.slice(0, 8).map((label) => ({ label, kind: 'popular' as const }))
  );
  const [expandedSearchTipKey, setExpandedSearchTipKey] = useState<string | null>(null);
  const [expandedTipCards, setExpandedTipCards] = useState<CardItem[]>([]);
  const [isExpandedTipLoading, setIsExpandedTipLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchDropdownMounted, setIsSearchDropdownMounted] = useState(false);
  const [eventCards, setEventCards] = useState<EventFeedItem[]>(getHomeEventsCache() ?? []);
  const [isLoadingEvents, setIsLoadingEvents] = useState(!getHomeEventsCache());
  const [recentCompanies, setRecentCompanies] = useState<RecentCompanyCard[]>([]);
  const [exploreCards, setExploreCards] = useState<CardItem[]>([]);
  const [isLoadingExplore, setIsLoadingExplore] = useState(false);
  const [isLoadingMoreExplore, setIsLoadingMoreExplore] = useState(false);
  const [exploreFilters, setExploreFilters] =
    useState<ExploreFilterState>(DEFAULT_EXPLORE_FILTERS);
  const [exploreSubcategories, setExploreSubcategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [showStickyExploreFilter, setShowStickyExploreFilter] = useState(false);
  const explorePoolRef = useRef<CardItem[]>([]);
  const exploreCursorRef = useRef(0);
  const exploreLoadingRef = useRef(false);
  const loadMoreExploreRef = useRef<() => void>(() => {});
  const searchLoadingMoreRef = useRef(false);
  const loadMoreSearchRef = useRef<() => void>(() => {});
  const searchHasMoreRef = useRef(searchHasMore);
  const searchActiveEndlessRef = useRef(false);
  searchHasMoreRef.current = searchHasMore;
  const exploreBlockYRef = useRef(0);
  const exploreFilterOffsetInBlockRef = useRef(0);
  const exploreFilterYSv = useSharedValue(Number.POSITIVE_INFINITY);
  const exploreStickyVisibleSv = useSharedValue(0);
  const [recommendedNowFeed, setRecommendedNowFeed] = useState<{
    title: string;
    subtitle: string;
    searchQuery: string;
    cards: CardItem[];
  } | null>(null);
  const [isLoadingRecommendedNow, setIsLoadingRecommendedNow] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [userCity, setUserCity] = useState<string | null>(null);
  const [customLocState, setCustomLocState] = useState<CustomLocationsState>({
    locations: [],
    activeId: null,
  });
  const [regionSelection, setRegionSelectionState] = useState<RegionSelection | null>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [locationMenuMounted, setLocationMenuMounted] = useState(false);
  const [locationMenuLan, setLocationMenuLan] = useState<string | null>(null);
  const locationMenuProgress = useSharedValue(0);
  const [locationPicking, setLocationPicking] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(HELSINGBORG_COORDS);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom);
  const heroTopInset = useHeroTopInset();
  const homeHeaderInset = Math.max(
    0,
    Math.max(heroTopInset, insets.top, Platform.OS === 'ios' ? 47 : 0) + HOME_NAV_EXTRA_TOP
  );
  /** Full hero photo band — never shorter than greeting + bleed (avoids stretch). */
  const homeHeroBandHeight =
    HOME_GREETING_HEIGHT + Math.max(homeHeaderInset, HOME_HERO_PHOTO_BLEED);
  const homeGreetingBandHeight = homeHeroBandHeight - homeHeaderInset;
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  const scrollOffsetRef = useRef(getHomeScrollOffset());
  const featuredPauseRef = useRef(false);
  const featuredPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const homeSearchBarRef = useRef<View>(null);
  const tipPreviewRequestRef = useRef(0);
  const expandedTipCacheRef = useRef<Map<string, CardItem[]>>(new Map());
  const searchDropdownProgress = useSharedValue(0);
  const searchOverlayProgress = useSharedValue(0);
  const searchBarEndY = useSharedValue(56);
  const searchBarEndX = useSharedValue(12);
  const searchBarEndW = useSharedValue(320);
  const searchBarHeightSv = useSharedValue(SEARCH_BAR_HEIGHT);
  const searchDropdownHeightSv = useSharedValue(SEARCH_DROPDOWN_MAX_HEIGHT);
  const [isSearchOverlayMounted, setIsSearchOverlayMounted] = useState(false);
  const [searchInputReady, setSearchInputReady] = useState(false);
  searchQueryRef.current = searchQuery;
  searchResultsRef.current = searchResults;
  const router = useRouter();
  const { markDataReady, isDataReady } = useAppReady();
  const { token, authFetch, isLoggedIn } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const homeScreenBg = theme.screenBg;
  /** Same as screen bg — banner gradient ends on this exact color. */
  const homeHeaderMeshBase = homeScreenBg;
  const homeHeaderPanelBg = 'transparent';
  const filterSurfaceStyle =
    Platform.OS === 'web'
      ? ({
          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.88)',
          borderWidth: 1,
          borderColor: theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(19, 23, 32, 0.08)',
          backdropFilter: 'blur(16px) saturate(160%)',
          WebkitBackdropFilter: 'blur(16px) saturate(160%)',
          boxShadow: theme.isDark
            ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 28px rgba(10,15,28,0.35)'
            : 'inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 28px rgba(19,23,32,0.08)',
        } as const)
      : theme.isDark
        ? FilterChipTheme.surface
        : {
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: 'rgba(19, 23, 32, 0.12)',
          };

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

  const { scrollHideProgress } = useTabBarMotion();
  const homeScrollYSv = useSharedValue(Math.max(0, getHomeScrollOffset()));
  const homeScrollLastYSv = useSharedValue(Math.max(0, getHomeScrollOffset()));
  /** Discrete target for tab-bar scroll hide (avoids restarting withTiming every frame). */
  const tabBarScrollHiddenSv = useSharedValue(0);
  const [isSearchStuck, setIsSearchStuck] = useState(
    () => getHomeScrollOffset() >= HOME_GREETING_HEIGHT - 1
  );
  const [searchPanelHeight, setSearchPanelHeight] = useState(120);

  const homeScrollPersistYSv = useSharedValue(-1);

  const persistHomeScrollY = useCallback((y: number) => {
    const next = Math.max(0, y);
    scrollOffsetRef.current = next;
    setHomeScrollOffset(next);
  }, []);

  const restoreHomeScroll = useCallback(() => {
    const y = Math.max(0, getHomeScrollOffset());
    homeScrollYSv.value = y;
    homeScrollLastYSv.value = y;
    homeScrollPersistYSv.value = y;
    setIsSearchStuck(y >= HOME_GREETING_HEIGHT - 1);
    if (y <= 0) {
      tabBarScrollHiddenSv.value = 0;
      scrollHideProgress.value = withTiming(0, { duration: 220 });
      return;
    }
    const apply = () => {
      scrollRef.current?.scrollTo({ y, animated: false });
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    // Web layout often settles after the first paint when returning from a stack screen.
    if (Platform.OS === 'web') {
      setTimeout(apply, 50);
      setTimeout(apply, 160);
    }
  }, [
    homeScrollLastYSv,
    homeScrollPersistYSv,
    homeScrollYSv,
    scrollHideProgress,
    tabBarScrollHiddenSv,
  ]);

  const homeScrollStuckSv = useSharedValue(getHomeScrollOffset() >= HOME_GREETING_HEIGHT - 1 ? 1 : 0);

  const pauseFeaturedForScroll = useCallback(() => {
    featuredPauseRef.current = true;
    if (featuredPauseTimerRef.current) clearTimeout(featuredPauseTimerRef.current);
    featuredPauseTimerRef.current = setTimeout(() => {
      featuredPauseRef.current = false;
      featuredPauseTimerRef.current = null;
    }, 1800);
  }, []);

  const syncHomeScrollJs = useCallback((y: number, stuck: boolean) => {
    persistHomeScrollY(y);
    setIsSearchStuck((prev) => (prev === stuck ? prev : stuck));
    pauseFeaturedForScroll();
  }, [pauseFeaturedForScroll, persistHomeScrollY]);

  const syncStickyExploreFilter = useCallback((sticky: boolean) => {
    setShowStickyExploreFilter((prev) => (prev === sticky ? prev : sticky));
  }, []);

  const triggerLoadMoreExplore = useCallback(() => {
    // While searching, keep endless scroll but page the search API instead of Utforska.
    if (searchActiveEndlessRef.current) {
      loadMoreSearchRef.current();
      return;
    }
    loadMoreExploreRef.current();
  }, []);

  const updateExploreFilterAnchorY = useCallback(() => {
    // Home content View uses paddingTop: 16; children y is inside that box.
    exploreFilterYSv.value =
      16 + exploreBlockYRef.current + exploreFilterOffsetInBlockRef.current;
  }, [exploreFilterYSv]);

  // Greeting collapse stays on the UI thread; persist Y often enough to restore after detail.
  const onHomeScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = Math.max(0, event.contentOffset.y);
      const dy = y - homeScrollLastYSv.value;
      homeScrollYSv.value = y;
      homeScrollLastYSv.value = y;

      // Hide tab bar on scroll down; reveal on scroll up / near top.
      let nextHidden = tabBarScrollHiddenSv.value;
      if (y < 20) {
        nextHidden = 0;
      } else if (dy > 6) {
        nextHidden = 1;
      } else if (dy < -6) {
        nextHidden = 0;
      }
      if (nextHidden !== tabBarScrollHiddenSv.value) {
        tabBarScrollHiddenSv.value = nextHidden;
        scrollHideProgress.value = withTiming(nextHidden, { duration: 220 });
      }

      // Keep restore position fresh even when the sticky header state doesn't change.
      if (Math.abs(y - homeScrollPersistYSv.value) >= 20) {
        homeScrollPersistYSv.value = y;
        runOnJS(persistHomeScrollY)(y);
      }

      const stuckN = y >= HOME_GREETING_HEIGHT - 1 ? 1 : 0;
      if (stuckN !== homeScrollStuckSv.value) {
        homeScrollStuckSv.value = stuckN;
        runOnJS(syncHomeScrollJs)(y, stuckN === 1);
      }

      // Pin Utforska filter under kategori chips once it reaches the sticky header.
      const exploreStickN =
        y >= HOME_GREETING_HEIGHT + exploreFilterYSv.value - 2 ? 1 : 0;
      if (exploreStickN !== exploreStickyVisibleSv.value) {
        exploreStickyVisibleSv.value = exploreStickN;
        runOnJS(syncStickyExploreFilter)(exploreStickN === 1);
      }

      const viewport = event.layoutMeasurement.height;
      const contentH = event.contentSize.height;
      if (viewport > 0 && contentH > viewport + 80) {
        const distanceFromBottom = contentH - (y + viewport);
        if (distanceFromBottom < 480) {
          runOnJS(triggerLoadMoreExplore)();
        }
      }
    },
    onBeginDrag: () => {
      runOnJS(pauseFeaturedForScroll)();
    },
    onEndDrag: (event) => {
      const y = Math.max(0, event.contentOffset.y);
      homeScrollYSv.value = y;
      homeScrollLastYSv.value = y;
      homeScrollPersistYSv.value = y;
      const stuck = y >= HOME_GREETING_HEIGHT - 1;
      homeScrollStuckSv.value = stuck ? 1 : 0;
      if (y < 20 && tabBarScrollHiddenSv.value !== 0) {
        tabBarScrollHiddenSv.value = 0;
        scrollHideProgress.value = withTiming(0, { duration: 220 });
      }
      runOnJS(syncHomeScrollJs)(y, stuck);
    },
    onMomentumEnd: (event) => {
      const y = Math.max(0, event.contentOffset.y);
      homeScrollYSv.value = y;
      homeScrollLastYSv.value = y;
      homeScrollPersistYSv.value = y;
      const stuck = y >= HOME_GREETING_HEIGHT - 1;
      homeScrollStuckSv.value = stuck ? 1 : 0;
      if (y < 20 && tabBarScrollHiddenSv.value !== 0) {
        tabBarScrollHiddenSv.value = 0;
        scrollHideProgress.value = withTiming(0, { duration: 220 });
      }
      runOnJS(syncHomeScrollJs)(y, stuck);
    },
  });

  const greetingCollapseStyle = useAnimatedStyle(() => {
    const collapse = Math.min(homeScrollYSv.value, homeGreetingBandHeight);
    return {
      height: Math.max(0, homeGreetingBandHeight - collapse),
      opacity: interpolate(
        homeScrollYSv.value,
        [0, homeGreetingBandHeight * 0.45, homeGreetingBandHeight],
        [1, 0.55, 0],
        'clamp'
      ),
      transform: [
        {
          translateY: interpolate(
            homeScrollYSv.value,
            [0, homeGreetingBandHeight],
            [0, -10],
            'clamp'
          ),
        },
      ],
      overflow: 'hidden' as const,
    };
  });

  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      const tick = setInterval(() => setNowMs(Date.now()), 60_000);
      blurActiveElementOnWeb();
      const task = InteractionManager.runAfterInteractions(() => {
        restoreHomeScroll();
      });
      // Extra pass after stack transition / layout on return.
      const restoreTimer = setTimeout(() => restoreHomeScroll(), 220);

      return () => {
        clearInterval(tick);
        clearTimeout(restoreTimer);
        task.cancel();
        tabBarScrollHiddenSv.value = 0;
        scrollHideProgress.value = withTiming(0, { duration: 220 });
        const y = Math.max(0, homeScrollYSv.value);
        scrollOffsetRef.current = y;
        setHomeScrollOffset(y);
        if (searchQueryRef.current.trim()) {
          setHomeSearchCache(
            searchQueryRef.current,
            searchResultsRef.current as OfferCardItem[]
          );
        }
      };
    }, [
      homeScrollYSv,
      restoreHomeScroll,
      scrollHideProgress,
      tabBarScrollHiddenSv,
    ])
  );

  useEffect(() => {
    if (!coords || deals.length === 0) return;

    // Instant re-rank from lat/lng so meter badges update as soon as GPS/place changes.
    setDeals((prev) => sortDealsByDistance(applyHaversineDistances(prev, coords)));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when place or list size changes
  }, [coords?.lat, coords?.lng, deals.length, refreshNonce]);

  const refreshEffectiveCoords = useCallback(async () => {
    // Prefer custom place / already-granted GPS. Never overwrite a known position
    // with Helsingborg just because a GPS read failed momentarily.
    const next = await getEffectiveUserCoordsIfGranted().catch(() => null);
    if (!next) return;
    setCoords((prev) => (sameCoords(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Seed Helsingborg for first paint; upgrade when custom/GPS is available.
    void (async () => {
      const granted = await getEffectiveUserCoordsIfGranted().catch(() => null);
      if (cancelled) return;
      if (granted) {
        setCoords((prev) => (sameCoords(prev, granted) ? prev : granted));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDataReady) return;
    let cancelled = false;

    void (async () => {
      const { getActiveCustomLocationCoords } = await import('@/lib/custom-locations');
      const custom = await getActiveCustomLocationCoords().catch(() => null);
      if (cancelled) return;
      if (custom) {
        setCoords((prev) => (sameCoords(prev, custom) ? prev : custom));
        return;
      }

      // Already allowed — upgrade Helsingborg → real GPS without a dialog.
      const granted = await getUserCoordsIfGranted().catch(() => null);
      if (cancelled) return;
      if (granted) {
        setCoords((prev) => (sameCoords(prev, granted) ? prev : granted));
        return;
      }

      // Ask once after splash/frontpage is ready (does not block first paint).
      const prompted = await getUserCoords().catch(() => null);
      if (cancelled) return;
      if (prompted) {
        setCoords((prev) => (sameCoords(prev, prompted) ? prev : prompted));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDataReady]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCustomLocationsState(), loadRegionSelection()]).then(
      ([customState, region]) => {
        if (cancelled) return;
        setCustomLocState(customState);
        setRegionSelectionState(region);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read place when user changes Plats (or returns to Upptäck) so distances refresh.
  useEffect(
    () =>
      subscribeCustomLocations((state) => {
        setCustomLocState(state);
        void (async () => {
          if (state.activeId) {
            const active = state.locations.find((item) => item.id === state.activeId);
            if (active) {
              const next = { lat: active.lat, lng: active.lng };
              setCoords((prev) => (sameCoords(prev, next) ? prev : next));
              return;
            }
          }
          const region = await loadRegionSelection();
          if (region) {
            setRegionSelectionState(region);
            const next = { lat: region.lat, lng: region.lng };
            setCoords((prev) => (sameCoords(prev, next) ? prev : next));
            return;
          }
          // Left custom place → device GPS (may prompt). Helsingborg if GPS unavailable.
          const gps =
            (await getUserCoordsIfGranted().catch(() => null)) ??
            (await getUserCoords().catch(() => null)) ??
            HELSINGBORG_COORDS;
          setCoords((prev) => (sameCoords(prev, gps) ? prev : gps));
        })();
      }),
    []
  );

  useEffect(
    () =>
      subscribeRegionSelection((selection) => {
        setRegionSelectionState(selection);
        if (!selection) return;
        if (customLocState.activeId) return;
        const next = { lat: selection.lat, lng: selection.lng };
        setCoords((prev) => (sameCoords(prev, next) ? prev : next));
        userCityRef.current = selection.city;
        setUserCity(selection.city);
      }),
    [customLocState.activeId]
  );

  const homeLocationLabel = useMemo(() => {
    if (customLocState.activeId) {
      const active = customLocState.locations.find((item) => item.id === customLocState.activeId);
      if (active?.label?.trim()) return active.label.trim();
    }
    if (regionSelection?.city?.trim()) return regionSelection.city.trim();
    return (
      userCity?.trim() ||
      resolveEventFeedCity(userCity, coords) ||
      'Helsingborg'
    );
  }, [
    coords,
    customLocState.activeId,
    customLocState.locations,
    regionSelection?.city,
    userCity,
  ]);

  /** Municipality for hero copy — ignores custom place nicknames like "jobb". */
  const homeKommunLabel = useMemo(() => {
    return (
      regionSelection?.city?.trim() ||
      userCity?.trim() ||
      resolveEventFeedCity(userCity, coords) ||
      'Helsingborg'
    );
  }, [coords, regionSelection?.city, userCity]);

  const [cityHeroUris, setCityHeroUris] = useState<string[]>(
    () => peekCityImageUris('Helsingborg') ?? []
  );
  const [cityHeroIndex, setCityHeroIndex] = useState(0);
  const onCityHeroIndexChange = useCallback((next: number) => {
    setCityHeroIndex(next);
  }, []);
  /** Remount the location blur whenever the hero photo under it changes. */
  const locationBlurKey =
    cityHeroUris[cityHeroIndex] ??
    cityHeroUris[0] ??
    `city:${homeKommunLabel}`;

  useEffect(() => {
    let cancelled = false;
    const cached = peekCityImageUris(homeKommunLabel);
    setCityHeroUris(cached ?? []);
    setCityHeroIndex(0);
    if (cached?.length) schedulePrefetchImageUris(cached);

    void fetchCityImageUris(homeKommunLabel, 3).then((uris) => {
      if (cancelled) return;
      setCityHeroUris(uris);
      setCityHeroIndex(0);
      if (uris.length) schedulePrefetchImageUris(uris);
    });

    return () => {
      cancelled = true;
    };
  }, [homeKommunLabel]);

  useFocusEffect(
    useCallback(() => {
      void refreshEffectiveCoords();
    }, [refreshEffectiveCoords])
  );

  useEffect(() => {
    let cancelled = false;

    void fetchSearchTips({
      take: EMPTY_SEARCH_TIPS_TAKE,
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

  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) {
        resetRecentCompanyBaseline();
        setRecentCompanies([]);
        return;
      }

      let cancelled = false;
      void fetchRecentBusinesses(authFetch).then((cards) => {
        if (!cancelled) setRecentCompanies(cards);
      });

      return () => {
        cancelled = true;
      };
    }, [authFetch, isLoggedIn, refreshNonce])
  );

  useEffect(() => {
    let cancelled = false;
    const trimmed = searchQuery.trim();

    if (trimmed.length >= 1) {
      const instantShops = getLocalBusinessSearchTips(
        trimmed,
        knownCardsRef.current,
        SEARCH_SHOP_TIPS_TAKE
      );
      if (instantShops.length > 0) {
        setSearchTips([
          ...instantShops,
          ...DEFAULT_SEARCH_TIPS.map((label) => ({ label, kind: 'tip' as const })),
        ]);
      }
    }

    const timer = setTimeout(() => {
      void (async () => {
        const tips = await fetchSearchTips({
          take: trimmed.length >= 1 ? 8 : EMPTY_SEARCH_TIPS_TAKE,
          q: trimmed.length >= 1 ? trimmed : undefined,
          city: userCityRef.current ?? undefined,
          authFetch,
          isLoggedIn,
        });
        if (cancelled) return;

        const known = knownCardsRef.current;
        const enrichTip = (tip: SearchTipItem): SearchTipItem => {
          if (tip.imageUri || (tip.previewImages && tip.previewImages.length > 0)) {
            return tip;
          }
          const match = known.find(
            (card) =>
              (tip.id && card.id === tip.id) ||
              card.title.toLocaleLowerCase('sv-SE') === tip.label.toLocaleLowerCase('sv-SE')
          );
          const uri =
            match &&
            typeof match.image === 'object' &&
            match.image &&
            'uri' in match.image &&
            typeof match.image.uri === 'string'
              ? match.image.uri
              : undefined;
          const subtitle =
            tip.subtitle ||
            (tip.kind === 'business' ? match?.categoryName?.trim() : undefined);
          return {
            ...tip,
            ...(uri ? { imageUri: uri } : null),
            ...(subtitle ? { subtitle } : null),
          };
        };

        if (trimmed.length >= 1) {
          const localShops = getLocalBusinessSearchTips(trimmed, known, SEARCH_SHOP_TIPS_TAKE);
          setSearchTips(mergeSearchTips(localShops, tips).map(enrichTip));
          return;
        }

        if (tips.length > 0) {
          setSearchTips(tips.map(enrichTip));
        }
      })();
    }, trimmed.length >= 1 ? SEARCH_TIPS_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, authFetch, isLoggedIn]);

  useEffect(() => {
    let cancelled = false;
    void loadLocalRecentSearches().then((queries) => {
      if (!cancelled) setRecentSearches(queries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPopularSearches({
      city: userCityRef.current ?? undefined,
      take: 20,
    }).then((rows) => {
      if (cancelled || rows.length === 0) return;
      setPopularSearches(rows.map((row) => ({ label: row.query, kind: 'popular' as const })));
    });
    return () => {
      cancelled = true;
    };
  }, [isSearchOverlayMounted]);

  useEffect(() => {
    return () => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
      }
    };
  }, []);

  const openSearchDropdown = useCallback((_options?: { instant?: boolean }) => {
    if (Platform.OS === 'web') {
      void import('@/components/ui/maplibre-map.web').then((mod) => {
        mod.prefetchBusinessMapAssets();
      });
    }
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }

    const endY = insets.top + 8;
    const endX =
      SEARCH_OVERLAY_SIDE_PAD +
      SEARCH_OVERLAY_BACK_SIZE +
      SEARCH_OVERLAY_MAP_BUTTON_GAP;
    const endRightReserve =
      SEARCH_OVERLAY_SIDE_PAD +
      SEARCH_OVERLAY_MAP_BUTTON_SIZE +
      SEARCH_OVERLAY_MAP_BUTTON_GAP;
    const endW = Math.max(160, windowWidth - endX - endRightReserve);

    // Appear in place — no fly/morph from the home search bar.
    cancelAnimation(searchOverlayProgress);
    searchBarEndY.value = endY;
    searchBarEndX.value = endX;
    searchBarEndW.value = endW;
    searchOverlayProgress.value = 0;
    setSearchInputReady(false);
    setIsSearchFocused(true);
    setIsSearchOverlayMounted(true);
    requestAnimationFrame(() => {
      searchOverlayProgress.value = withTiming(
        1,
        {
          duration: SEARCH_OVERLAY_OPEN_MS,
          easing: SEARCH_OVERLAY_OPEN_EASING,
        },
        (finished) => {
          if (finished) {
            runOnJS(setSearchInputReady)(true);
          }
        }
      );
    });
  }, [
    insets.top,
    searchBarEndW,
    searchBarEndX,
    searchBarEndY,
    searchOverlayProgress,
    windowWidth,
  ]);

  const closeSearchOverlay = useCallback(() => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    setSearchInputReady(false);
    blurActiveElementOnWeb();
    cancelAnimation(searchOverlayProgress);
    searchOverlayProgress.value = withTiming(
      0,
      {
        duration: SEARCH_OVERLAY_CLOSE_MS,
        easing: SEARCH_OVERLAY_CLOSE_EASING,
      },
      (finished) => {
        if (finished) {
          runOnJS(setIsSearchFocused)(false);
          runOnJS(setIsSearchOverlayMounted)(false);
        }
      }
    );
  }, [searchOverlayProgress]);

  /** Instant dismiss — used when crossfading into map mode. */
  const snapCloseSearchOverlay = useCallback(() => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    setSearchInputReady(false);
    blurActiveElementOnWeb();
    cancelAnimation(searchOverlayProgress);
    searchOverlayProgress.value = 0;
    setIsSearchFocused(false);
    setIsSearchOverlayMounted(false);
  }, [searchOverlayProgress]);

  /** Kept for any remaining blur hooks — overlay closes only via back / explicit dismiss. */
  const closeSearchDropdown = useCallback(() => {
    // no-op: full-screen search stays open until the user taps back
  }, []);

  const clearVoiceSearchOwnership = useCallback(() => {
    voiceQueryRef.current = null;
    voiceResultOrderRef.current = null;
  }, []);

  // Map mode → search: reopen the search overlay with the carried query.
  useFocusEffect(
    useCallback(() => {
      const pending = consumeOpenHomeSearch();
      if (!pending) return;
      clearVoiceSearchOwnership();
      setSearchCommitted(false);
      setSearchQuery(pending.query);
      const open = () => openSearchDropdown({ instant: true });
      if (pending.fromMap) {
        requestAnimationFrame(open);
        return;
      }
      const task = InteractionManager.runAfterInteractions(open);
      return () => task.cancel();
    }, [clearVoiceSearchOwnership, openSearchDropdown])
  );

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

  const toggleSearchTipExpand = useCallback(
    (tip: SearchTipItem) => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
        searchBlurTimerRef.current = null;
      }

      const key = getSearchTipKey(tip);
      if (expandedSearchTipKey === key) {
        tipPreviewRequestRef.current += 1;
        setExpandedSearchTipKey(null);
        setExpandedTipCards([]);
        setIsExpandedTipLoading(false);
        return;
      }

      const known = uniqueCardsById([...deals, ...hotOfferCards, ...nearYouCards]);
      const cached = expandedTipCacheRef.current.get(key);
      const localMatches =
        cached ?? matchCardsToSearchTip(known, tip, categoryFilters);
      const requestId = tipPreviewRequestRef.current + 1;
      tipPreviewRequestRef.current = requestId;
      setExpandedSearchTipKey(key);
      setExpandedTipCards(localMatches);
      setIsExpandedTipLoading(false);

      if (cached || localMatches.length >= SEARCH_TIP_PREVIEW_LIMIT) {
        if (!cached && localMatches.length > 0) {
          expandedTipCacheRef.current.set(key, localMatches);
        }
        return;
      }

      setIsExpandedTipLoading(true);
      void searchCatalog(tip.label, {
        take: SEARCH_TIP_PREVIEW_LIMIT,
        maxHydrate: SEARCH_TIP_PREVIEW_LIMIT,
        city: userCityRef.current ?? undefined,
        knownCards: known,
      })
        .then((results) => {
          if (tipPreviewRequestRef.current !== requestId) return;
          const businesses = (results as CardItem[]).filter(
            (card) => card.resultKind !== 'event'
          );
          const merged = uniqueCardsById([...localMatches, ...businesses]).slice(
            0,
            SEARCH_TIP_PREVIEW_LIMIT
          );
          expandedTipCacheRef.current.set(key, merged);
          setExpandedTipCards(merged);
        })
        .catch(() => {
          if (tipPreviewRequestRef.current !== requestId) return;
          expandedTipCacheRef.current.set(key, localMatches);
          setExpandedTipCards(localMatches);
        })
        .finally(() => {
          if (tipPreviewRequestRef.current === requestId) {
            setIsExpandedTipLoading(false);
          }
        });
    },
    [categoryFilters, deals, expandedSearchTipKey, hotOfferCards, nearYouCards]
  );

  /** Tap the tip label → run that query (not expand). */
  const rememberSearch = useCallback((raw: string) => {
    setRecentSearches((prev) => {
      const next = prependLocalRecentSearch(prev, raw);
      if (next !== prev) void persistLocalRecentSearches(next);
      return next;
    });
  }, []);

  const selectSearchTip = useCallback(
    (tip: SearchTipItem) => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
        searchBlurTimerRef.current = null;
      }
      clearVoiceSearchOwnership();
      stopVoiceSession();
      tipPreviewRequestRef.current += 1;
      setExpandedSearchTipKey(null);
      setExpandedTipCards([]);
      setIsExpandedTipLoading(false);
      setSearchQuery(tip.label);
      setSearchCommitted(false);
    },
    [clearVoiceSearchOwnership, stopVoiceSession]
  );

  const selectHomeTipCard = useCallback(
    (tip: HomeTipCard) => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
        searchBlurTimerRef.current = null;
      }
      clearVoiceSearchOwnership();
      stopVoiceSession();
      tipPreviewRequestRef.current += 1;
      setExpandedSearchTipKey(null);
      setExpandedTipCards([]);
      setIsExpandedTipLoading(false);
      setSearchQuery(tip.query);
      setSearchCommitted(true);
    },
    [clearVoiceSearchOwnership, stopVoiceSession]
  );

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
      setSearchCommitted(true);
      setIsSearchLoading(true);
      setVoiceStatusMessage(null);
      closeSearchOverlay();

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
                setUserCity(loc);
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
        setSearchHasMore(next.length >= SEARCH_PAGE_SIZE);
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
    [authFetch, clearVoiceSearchOwnership, closeSearchOverlay, lockVoiceResultOrder]
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
      setUserCity(null);
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
          setUserCity(loc);
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
    const city = resolveEventFeedCity(userCity, coords);
    if (!city) return;
    if (getHomeEventsCacheCity() === city && (getHomeEventsCache()?.length ?? 0) > 0) return;

    let cancelled = false;
    void fetchEventFeed({ days: EVENT_FEED_DAYS, city })
      .then((events) => {
        if (cancelled) return;
        setEventCards(events);
        setHomeEventsCache(events, city);
        setIsLoadingEvents(false);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [coords, refreshNonce, userCity]);

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
    let requestId = 0;

    const loadHomeData = async (
      background = false,
      loadCoords: { lat: number; lng: number } | null = coords
    ) => {
      const thisRequest = ++requestId;

      if (hasFreshHomeScreenSnapshot() && refreshNonce === 0 && !background) {
        const snapshot = getHomeScreenSnapshot();
        const cachedEvents = getHomeEventsCache() ?? [];
        if (snapshot) {
          const snapDeals = snapshot.deals as OfferCardItem[];
          const snapNear = snapshot.nearYouCards as OfferCardItem[];
          const snapHot = snapshot.hotOfferCards as OfferCardItem[];
          const withDistDeals = loadCoords
            ? sortDealsByDistance(applyHaversineDistances(snapDeals, loadCoords))
            : snapDeals;
          const withDistNear = loadCoords
            ? applyHaversineDistances(snapNear, loadCoords)
            : snapNear;
          const withDistHot = loadCoords
            ? applyHaversineDistances(snapHot, loadCoords)
            : snapHot;

          setCategoryFilters(snapshot.categoryFilters as FilterCategory[]);
          setDeals(withDistDeals);
          setNearYouCards(withDistNear);
          setHotOfferCards(withDistHot);
          setEventCards(cachedEvents);
          setIsLoadingData(false);
          setIsLoadingEvents(false);

          try {
            const settled = await settleHomeScreenAssetsWithinBudget({
              deals: withDistDeals,
              nearYouCards: withDistNear,
              hotOfferCards: withDistHot,
              events: cachedEvents,
            });
            if (cancelled || thisRequest !== requestId) return;
            setDeals(
              loadCoords
                ? sortDealsByDistance(applyHaversineDistances(settled.deals, loadCoords))
                : settled.deals
            );
            setNearYouCards(
              loadCoords
                ? applyHaversineDistances(settled.nearYouCards, loadCoords)
                : settled.nearYouCards
            );
            setHotOfferCards(
              loadCoords
                ? applyHaversineDistances(settled.hotOfferCards, loadCoords)
                : settled.hotOfferCards
            );
            if (loadCoords) {
              const enriched = await fillMissingDistancesFromAddresses(
                settled.deals,
                loadCoords,
                { maxGeocode: 24 }
              );
              if (cancelled || thisRequest !== requestId) return;
              setDeals(sortDealsByDistance(applyHaversineDistances(enriched, loadCoords)));
            }
          } catch {
            // Content is already visible from the snapshot.
          }
        }
        if (!cancelled && thisRequest === requestId) markDataReady();
        setTimeout(() => {
          if (!cancelled && !hasFreshHomeScreenSnapshot(60_000)) {
            void loadHomeData(true, loadCoords);
          }
        }, 2000);
        return;
      }

      if (!background && !getHomeScreenSnapshot()) {
        setIsLoadingData(true);
      }
      if (!background && !getHomeEventsCache()) {
        setIsLoadingEvents(true);
      }

      try {
        const eventCity = resolveEventFeedCity(userCityRef.current, loadCoords);
        const data = await fetchHomeScreenData({
          token,
          coords: loadCoords,
          city: eventCity,
        });
        const events =
          data.source === 'home' && Array.isArray(data.events)
            ? data.events
            : await fetchEventFeed({
                days: EVENT_FEED_DAYS,
                city: eventCity,
              }).catch(() => [] as EventFeedItem[]);

        if (cancelled || thisRequest !== requestId) return;

        if (data.cityImageUris?.length) {
          setCityHeroUris(data.cityImageUris);
        }

        const dealsList = loadCoords
          ? sortDealsByDistance(applyHaversineDistances(data.deals, loadCoords))
          : data.deals;
        const nearYouFromApi = loadCoords
          ? applyHaversineDistances(data.nearYouCards, loadCoords)
          : data.nearYouCards;
        const hotFromApi = loadCoords
          ? applyHaversineDistances(data.hotOfferCards, loadCoords)
          : data.hotOfferCards;

        // Paint content immediately — don't wait for image settle to clear Laddar.
        setCategoryFilters(data.categoryFilters);
        setDeals(dealsList);
        setNearYouCards(nearYouFromApi);
        setHotOfferCards(hotFromApi);
        setEventCards(events);
        setHomeEventsCache(events, data.resolvedCity ?? eventCity);
        setIsLoadingData(false);
        setIsLoadingEvents(false);
        setIsRefreshing(false);

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
              categoryId: card.categoryId,
              categoryIds: card.categoryIds,
              categoryName: card.categoryName,
              openingHours: card.openingHours,
            };
          })
        );
        setHomeHotOffersCache(hotFromApi);
        setHomeEndingSoonCache(nearYouFromApi);

        const settled = await settleHomeScreenAssetsWithinBudget({
          deals: dealsList,
          nearYouCards: nearYouFromApi,
          hotOfferCards: hotFromApi,
          events,
        });
        if (cancelled || thisRequest !== requestId) return;

        const settledDeals = loadCoords
          ? sortDealsByDistance(applyHaversineDistances(settled.deals, loadCoords))
          : settled.deals;
        const settledNear = loadCoords
          ? applyHaversineDistances(settled.nearYouCards, loadCoords)
          : settled.nearYouCards;
        const settledHot = loadCoords
          ? applyHaversineDistances(settled.hotOfferCards, loadCoords)
          : settled.hotOfferCards;

        setDeals(settledDeals);
        setHotOfferCards(settledHot);
        setNearYouCards(settledNear);
        setHomeHotOffersCache(settledHot);
        setHomeEndingSoonCache(settledNear);
        setHomeScreenSnapshot({
          categoryFilters: data.categoryFilters,
          deals: settledDeals,
          nearYouCards: settledNear,
          hotOfferCards: settledHot,
        });

        if (loadCoords) {
          const enriched = await fillMissingDistancesFromAddresses(settledDeals, loadCoords, {
            maxGeocode: 24,
          });
          if (cancelled || thisRequest !== requestId) return;
          setDeals(sortDealsByDistance(enriched));
        }
      } catch {
        if (!cancelled && thisRequest === requestId) {
          setCategoryFilters([]);
          setDeals([]);
          setNearYouCards([]);
          setHotOfferCards([]);
          setEventCards([]);
          Alert.alert('Fel', 'Kunde inte ladda startsidan just nu.');
        }
      } finally {
        if (!cancelled && thisRequest === requestId) {
          setIsLoadingData(false);
          setIsLoadingEvents(false);
          setIsRefreshing(false);
          markDataReady();
        }
      }
    };

    void loadHomeData(false, coords);

    return () => {
      cancelled = true;
    };
    // Coords are applied via a separate soft-refresh effect so GPS permission
    // cannot cancel the first paint and leave sections stuck on "Laddar...".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDataReady, refreshNonce, token]);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    void (async () => {
      try {
        const eventCity = resolveEventFeedCity(userCityRef.current, coords);
        const data = await fetchHomeScreenData({
          token,
          coords,
          city: eventCity,
        });
        if (cancelled) return;

        if (data.cityImageUris?.length) {
          setCityHeroUris(data.cityImageUris);
        }

        // Paint immediately with distances — don't wait for image settle.
        const dealsWithDistance = sortDealsByDistance(
          applyHaversineDistances(data.deals, coords)
        );
        const nearWithDistance = applyHaversineDistances(data.nearYouCards, coords);
        const hotWithDistance = applyHaversineDistances(data.hotOfferCards, coords);

        setCategoryFilters(data.categoryFilters);
        setDeals(dealsWithDistance);
        setNearYouCards(nearWithDistance);
        setHotOfferCards(hotWithDistance);
        setHomeScreenSnapshot({
          categoryFilters: data.categoryFilters,
          deals: dealsWithDistance,
          nearYouCards: nearWithDistance,
          hotOfferCards: hotWithDistance,
        });
        setHomeHotOffersCache(hotWithDistance);
        setHomeEndingSoonCache(nearWithDistance);

        if (data.source === 'home' && Array.isArray(data.events)) {
          setEventCards(data.events);
          setHomeEventsCache(data.events, data.resolvedCity ?? eventCity);
        } else {
          void fetchEventFeed({ days: EVENT_FEED_DAYS, city: eventCity })
            .then((events) => {
              if (cancelled) return;
              setEventCards(events);
              setHomeEventsCache(events, eventCity);
            })
            .catch(() => {});
        }

        const settled = await settleHomeScreenAssetsWithinBudget({
          deals: dealsWithDistance,
          nearYouCards: nearWithDistance,
          hotOfferCards: hotWithDistance,
          events: data.events,
        });
        if (cancelled) return;

        const paintedDeals = sortDealsByDistance(
          applyHaversineDistances(settled.deals, coords)
        );
        const paintedNear = applyHaversineDistances(settled.nearYouCards, coords);
        const paintedHot = applyHaversineDistances(settled.hotOfferCards, coords);

        setDeals(paintedDeals);
        setNearYouCards(paintedNear);
        setHotOfferCards(paintedHot);
        setHomeScreenSnapshot({
          categoryFilters: data.categoryFilters,
          deals: paintedDeals,
          nearYouCards: paintedNear,
          hotOfferCards: paintedHot,
        });
        setHomeHotOffersCache(paintedHot);
        setHomeEndingSoonCache(paintedNear);

        const enriched = await fillMissingDistancesFromAddresses(paintedDeals, coords, {
          maxGeocode: 24,
        });
        if (cancelled) return;
        setDeals(sortDealsByDistance(enriched));
      } catch {
        // Keep whatever the first load already painted.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng, token]);

  const filteredDeals = useMemo(
    () => filterCardsByActiveCategory(deals, activeCategory),
    [activeCategory, deals]
  );

  const filteredHotOfferCards = useMemo(() => {
    const filtered = filterCardsByActiveCategory(hotOfferCards, activeCategory);
    // Popular ranking payloads are often slim; backfill subcategory/hours from
    // catalog-backed deal cards so the focused mosaic can show them.
    const knownById = new Map<string, CardItem>();
    for (const card of deals) knownById.set(card.id, card);
    for (const card of nearYouCards) {
      if (!knownById.has(card.id)) knownById.set(card.id, card);
    }
    return filtered.map((card) => {
      const known = knownById.get(card.id);
      if (!known) return card;
      const needsSub =
        !(typeof card.subcategoryName === 'string' && card.subcategoryName.trim());
      const needsHours = card.openingHours == null && known.openingHours != null;
      if (!needsSub && !needsHours) return card;
      return {
        ...card,
        subcategoryName: needsSub ? known.subcategoryName : card.subcategoryName,
        openingHours: needsHours ? known.openingHours : card.openingHours,
      };
    });
  }, [activeCategory, deals, hotOfferCards, nearYouCards]);

  const recommendedNowMoment = useMemo(
    () => getRecommendedNowMoment(new Date(nowMs)),
    [nowMs]
  );

  const recommendedNowFallbackCards = useMemo(
    () =>
      pickRecommendedNowCards(
        uniqueCardsById([
          ...filteredDeals,
          ...filteredHotOfferCards,
          ...filterCardsByActiveCategory(nearYouCards, activeCategory),
        ]),
        recommendedNowMoment,
        8
      ),
    [activeCategory, filteredDeals, filteredHotOfferCards, nearYouCards, recommendedNowMoment]
  );

  const recommendedNowCards =
    recommendedNowFeed && recommendedNowFeed.cards.length > 0
      ? recommendedNowFeed.cards
      : recommendedNowFallbackCards;
  const recommendedNowTitle = recommendedNowFeed?.title ?? recommendedNowMoment.title;
  const recommendedNowSubtitle = recommendedNowFeed?.subtitle ?? recommendedNowMoment.subtitle;

  const discoveryPool = useMemo(
    () =>
      uniqueCardsById([
        ...filteredDeals,
        ...filteredHotOfferCards,
        ...filterCardsByActiveCategory(nearYouCards, activeCategory),
      ]),
    [activeCategory, filteredDeals, filteredHotOfferCards, nearYouCards]
  );

  const lunchCards = useMemo(() => {
    const keys = ['lunch', 'dagens', 'brunch'];
    return discoveryPool
      .filter((card) => {
        const hay = cardSearchHaystack(card);
        return keys.some((key) => hay.includes(key));
      })
      .slice(0, 10);
  }, [discoveryPool]);

  const leisureCategoryIds = useMemo(
    () =>
      categoryFilters
        .filter((cat) => {
          const label = cat.label.trim().toLocaleLowerCase('sv-SE');
          return WEEKEND_CATEGORY_HINTS.some((hint) => label.includes(hint));
        })
        .map((cat) => cat.id),
    [categoryFilters]
  );

  /** Weekend places: leisure categories first, keyword boosts, then hot fillers. */
  const weekendPlaceCards = useMemo(() => {
    const lunchIds = new Set(lunchCards.map((card) => card.id));
    const scored = discoveryPool
      .filter((card) => !lunchIds.has(card.id) && card.resultKind !== 'event')
      .map((card) => ({ card, score: scoreWeekendCard(card, leisureCategoryIds) }))
      .sort((a, b) => b.score - a.score);

    const strong = scored.filter((row) => row.score >= 4).map((row) => row.card);
    const soft = scored.filter((row) => row.score > 0 && row.score < 4).map((row) => row.card);
    const hotLeisure = filteredHotOfferCards.filter((card) => {
      if (lunchIds.has(card.id) || card.resultKind === 'event') return false;
      return scoreWeekendCard(card, leisureCategoryIds) >= 4;
    });
    const hotFill = applyCarouselMode(
      discoveryPool.filter((card) => !lunchIds.has(card.id) && card.resultKind !== 'event'),
      'hot',
      12
    );

    return uniqueCardsById([...strong, ...hotLeisure, ...soft, ...hotFill]).slice(0, 10);
  }, [discoveryPool, filteredHotOfferCards, leisureCategoryIds, lunchCards]);

  const weekendEvents = useMemo(() => {
    const now = new Date(nowMs);
    return eventCards
      .filter((event) => isComingWeekendMoment(event.startsAt, now))
      .slice(0, HOME_EVENT_TICKET_COUNT);
  }, [eventCards, nowMs]);

  /** One Till helgen strip: events + places interleaved (Evenemang badge only on events). */
  const weekendStripCards = useMemo(() => {
    const eventPosters = weekendEvents.map(eventFeedItemToCard);
    const merged = interleaveCardLists([eventPosters, weekendPlaceCards], 10);
    return merged.length >= 2 ? merged : [];
  }, [weekendEvents, weekendPlaceCards]);

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
  const showCommittedSearchResults = searchCommitted && isSearchActive;
  searchActiveEndlessRef.current =
    showCommittedSearchResults && trimmedSearchQuery.length >= 2;
  const showCommittedSearchPrompt = searchCommitted && isSearchTooShort;
  const shouldFetchSearch = isSearchActive && searchCommitted;

  useEffect(() => {
    if (showCommittedSearchResults || showCommittedSearchPrompt) {
      exploreStickyVisibleSv.value = 0;
      setShowStickyExploreFilter(false);
    }
  }, [
    exploreStickyVisibleSv,
    showCommittedSearchPrompt,
    showCommittedSearchResults,
  ]);

  useEffect(() => {
    tipPreviewRequestRef.current += 1;
    setExpandedSearchTipKey(null);
    setExpandedTipCards([]);
    setIsExpandedTipLoading(false);
  }, [trimmedSearchQuery]);

  useEffect(() => {
    if (isSearchOverlayMounted) return;
    tipPreviewRequestRef.current += 1;
    setExpandedSearchTipKey(null);
    setExpandedTipCards([]);
    setIsExpandedTipLoading(false);
  }, [isSearchOverlayMounted]);

  useEffect(() => {
    knownCardsRef.current = [...deals, ...hotOfferCards, ...nearYouCards];
  }, [deals, hotOfferCards, nearYouCards]);

  const rebuildExplorePool = useCallback(async () => {
    setIsLoadingExplore(true);
    exploreLoadingRef.current = true;
    try {
      const businessesRaw = (await fetchApprovedBusinessesCatalog()) as any[];
      const cityKey = userCity?.trim().toLocaleLowerCase('sv-SE') ?? '';
      let scoped = cityKey
        ? businessesRaw.filter(
            (business) =>
              typeof business?.city === 'string' &&
              business.city.trim().toLocaleLowerCase('sv-SE') === cityKey
          )
        : businessesRaw;
      // Fall back to the full catalog when the city filter is empty.
      if (scoped.length === 0) scoped = businessesRaw;

      if (exploreFilters.subcategoryId) {
        scoped = scoped.filter((business) =>
          businessHasSubcategoryId(business, exploreFilters.subcategoryId!)
        );
      }

      let cards = cardsFromCatalogBusinesses(scoped);
      if (!exploreFilters.subcategoryId) {
        cards = filterCardsByActiveCategory(cards, exploreFilters.categoryId);
      }
      if (coords) {
        cards = applyHaversineDistances(cards, coords);
      }

      if (exploreFilters.dealsOnly) {
        cards = cards.filter((card) => Boolean(card.deal));
      }
      if (exploreFilters.openNow) {
        cards = cards.filter((card) => {
          const hours = normalizeBusinessOpeningHours(card.openingHours);
          return isBusinessOpenNow(hours) === true;
        });
      }
      if (exploreFilters.maxDistanceKm != null) {
        const maxKm = exploreFilters.maxDistanceKm;
        cards = cards.filter(
          (card) =>
            typeof card.distanceKm === 'number' &&
            Number.isFinite(card.distanceKm) &&
            card.distanceKm <= maxKm
        );
      }

      cards = uniqueCardsById(cards);
      let pool: CardItem[];
      switch (exploreFilters.sort) {
        case 'near':
          pool = [...cards].sort((a, b) => {
            const da =
              typeof a.distanceKm === 'number' && Number.isFinite(a.distanceKm)
                ? a.distanceKm
                : Number.POSITIVE_INFINITY;
            const db =
              typeof b.distanceKm === 'number' && Number.isFinite(b.distanceKm)
                ? b.distanceKm
                : Number.POSITIVE_INFINITY;
            return da - db;
          });
          break;
        case 'name':
          pool = [...cards].sort((a, b) =>
            a.title.localeCompare(b.title, 'sv', { sensitivity: 'base' })
          );
          break;
        case 'deals':
          pool = [...cards].sort((a, b) => Number(b.deal) - Number(a.deal));
          break;
        case 'mixed':
        default:
          pool = shuffleCards(cards);
          break;
      }

      explorePoolRef.current = pool;
      exploreCursorRef.current = Math.min(EXPLORE_PAGE_SIZE, pool.length);
      setExploreCards(pool.slice(0, exploreCursorRef.current));
    } catch {
      explorePoolRef.current = [];
      exploreCursorRef.current = 0;
      setExploreCards([]);
    } finally {
      exploreLoadingRef.current = false;
      setIsLoadingExplore(false);
      setIsLoadingMoreExplore(false);
    }
  }, [coords, exploreFilters, userCity]);

  const loadMoreExplore = useCallback(() => {
    if (exploreLoadingRef.current) return;
    if (showCommittedSearchResults || showCommittedSearchPrompt) return;

    let pool = explorePoolRef.current;
    if (pool.length === 0) return;

    let cursor = exploreCursorRef.current;
    if (cursor >= pool.length) {
      // Endless: reshuffle mixed decks; sorted decks wrap from the start.
      if (exploreFilters.sort === 'mixed') {
        pool = shuffleCards(pool);
        explorePoolRef.current = pool;
      }
      cursor = 0;
    }

    const next = pool.slice(cursor, cursor + EXPLORE_PAGE_SIZE);
    if (next.length === 0) return;

    exploreLoadingRef.current = true;
    setIsLoadingMoreExplore(true);
    exploreCursorRef.current = cursor + next.length;
    setExploreCards((prev) => [...prev, ...next]);
    // Release the gate on the next frame so scroll spam doesn't double-append.
    requestAnimationFrame(() => {
      exploreLoadingRef.current = false;
      setIsLoadingMoreExplore(false);
    });
  }, [exploreFilters.sort, showCommittedSearchPrompt, showCommittedSearchResults]);

  loadMoreExploreRef.current = loadMoreExplore;

  const loadMoreSearch = useCallback(() => {
    if (searchLoadingMoreRef.current) return;
    if (!searchHasMoreRef.current) return;
    if (!showCommittedSearchResults) return;
    const q = trimmedSearchQuery.trim();
    if (q.length < 2) return;

    const skip = searchResultsRef.current.length;
    searchLoadingMoreRef.current = true;
    setIsLoadingMoreSearch(true);
    void searchCatalog(q, {
      take: SEARCH_PAGE_SIZE,
      skip,
      maxHydrate: 8,
      city: userCityRef.current ?? undefined,
      knownCards: [
        ...knownCardsRef.current,
        ...(searchResultsRef.current as OfferCardItem[]),
      ],
    })
      .then((page) => {
        if (voiceQueryRef.current && voiceQueryRef.current !== q) return;
        if (page.length === 0) {
          setSearchHasMore(false);
          return;
        }
        setSearchResults((prev) => {
          const merged = uniqueCardsById([...prev, ...(page as CardItem[])]);
          setHomeSearchCache(q, merged as OfferCardItem[]);
          return merged;
        });
        setSearchHasMore(page.length >= SEARCH_PAGE_SIZE);
      })
      .catch(() => {
        setSearchHasMore(false);
      })
      .finally(() => {
        searchLoadingMoreRef.current = false;
        setIsLoadingMoreSearch(false);
      });
  }, [showCommittedSearchResults, trimmedSearchQuery]);

  loadMoreSearchRef.current = loadMoreSearch;

  useEffect(() => {
    if (isLoadingData) return;
    if (showCommittedSearchResults || showCommittedSearchPrompt) return;
    void rebuildExplorePool();
  }, [
    exploreFilters,
    isLoadingData,
    rebuildExplorePool,
    refreshNonce,
    showCommittedSearchPrompt,
    showCommittedSearchResults,
  ]);

  // Utforska follows the top kategori chips — no separate category row.
  useEffect(() => {
    setExploreFilters((prev) => {
      if (prev.categoryId === activeCategory) return prev;
      return {
        ...prev,
        categoryId: activeCategory,
        subcategoryId: null,
      };
    });
  }, [activeCategory]);

  useEffect(() => {
    let cancelled = false;
    const parentId = activeCategory;
    if (
      !parentId ||
      parentId === ALL_CATEGORIES_ID ||
      parentId === OFFERS_CATEGORY_ID
    ) {
      setExploreSubcategories([]);
      setExploreFilters((prev) =>
        prev.subcategoryId == null ? prev : { ...prev, subcategoryId: null }
      );
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          apiUrl(`/category/${encodeURIComponent(parentId)}/subcategories`)
        );
        const json = res.ok ? await res.json().catch(() => []) : [];
        const rows = Array.isArray(json) ? json : [];
        const next = rows
          .map((row: any) => ({
            id: String(row?.id ?? '').trim(),
            name: typeof row?.name === 'string' ? row.name.trim() : '',
          }))
          .filter((row: { id: string; name: string }) => row.id && row.name);
        if (!cancelled) {
          setExploreSubcategories(next);
          setExploreFilters((prev) => {
            if (
              prev.subcategoryId &&
              next.some((row: { id: string }) => row.id === prev.subcategoryId)
            ) {
              return prev;
            }
            if (prev.subcategoryId == null) return prev;
            return { ...prev, subcategoryId: null };
          });
        }
      } catch {
        if (!cancelled) {
          setExploreSubcategories([]);
          setExploreFilters((prev) =>
            prev.subcategoryId == null ? prev : { ...prev, subcategoryId: null }
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

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

  const categorySpotlightSections = useMemo(() => {
    // Mat / Shopping / Sport are omitted from the home feed.
    const preferred = ['familj', 'skönhet', 'skonhet'];
    const sections: Array<{ id: string; label: string; cards: CardItem[] }> = [];
    const usedIds = new Set<string>();

    const tryAdd = (cat: { id: string; label: string }) => {
      if (!cat?.id || usedIds.has(cat.id)) return;
      if (isSpecificCategorySelected && cat.id === activeCategory) return;
      const label = cat.label.trim().toLocaleLowerCase('sv-SE');
      if (label.includes('mat') || label.includes('restaurang') || label.includes('café') || label.includes('cafe')) {
        return;
      }
      if (label.includes('shopping') || label.includes('butik')) return;
      if (label.includes('sport')) return;
      if (isAfterShoppingLabel(label)) return;
      const cards = discoveryPool
        .filter((card) => cardMatchesCategory(card, cat.id))
        .slice(0, 10);
      if (cards.length < 2) return;
      usedIds.add(cat.id);
      sections.push({ id: cat.id, label: cat.label, cards });
    };

    for (const pref of preferred) {
      if (sections.length >= 2) break;
      const cat = categoryFilters.find((item) => {
        const label = item.label.trim().toLocaleLowerCase('sv-SE');
        return label.includes(pref);
      });
      if (cat) tryAdd(cat);
    }

    if (sections.length < 2) {
      const ranked = [...categoryFilters]
        .map((cat) => ({
          cat,
          count: discoveryPool.filter((card) => cardMatchesCategory(card, cat.id)).length,
        }))
        .filter((row) => row.count >= 2)
        .sort((a, b) => b.count - a.count);
      for (const row of ranked) {
        if (sections.length >= 2) break;
        tryAdd(row.cat);
      }
    }

    return sections;
  }, [activeCategory, categoryFilters, discoveryPool, isSpecificCategorySelected]);

  const afterShoppingSections = useMemo(() => {
    const selectedLabel = selectedCategory?.label.trim().toLocaleLowerCase('sv-SE') ?? '';
    const sections: Array<{ id: string; label: string; cards: CardItem[] }> = [];

    for (const entry of AFTER_SHOPPING_HINTS) {
      if (
        isSpecificCategorySelected &&
        entry.hints.some((hint) => selectedLabel.includes(hint))
      ) {
        continue;
      }

      const cat = categoryFilters.find((item) => {
        const label = item.label.trim().toLocaleLowerCase('sv-SE');
        return entry.hints.some((hint) => label.includes(hint));
      });

      const fromCategory = cat
        ? discoveryPool.filter((card) => cardMatchesCategory(card, cat.id)).slice(0, 10)
        : [];

      const fromKeywords =
        fromCategory.length >= 2
          ? []
          : discoveryPool
              .filter((card) => {
                const hay = cardSearchHaystack(card);
                return entry.hints.some((hint) => hay.includes(hint));
              })
              .slice(0, 10);

      const cards = (fromCategory.length >= 2 ? fromCategory : fromKeywords).slice(0, 10);
      if (cards.length < 2) continue;

      sections.push({
        id: cat?.id ?? entry.fallbackId,
        label: cat?.label ?? entry.fallbackLabel,
        cards,
      });
    }

    return sections;
  }, [
    categoryFilters,
    discoveryPool,
    isSpecificCategorySelected,
    selectedCategory,
  ]);

  useEffect(() => {
    let cancelled = false;
    const categoryName =
      isSpecificCategorySelected && selectedCategory?.label
        ? selectedCategory.label
        : undefined;
    const city =
      userCity?.trim() ||
      (coords &&
      Math.abs(coords.lat - HELSINGBORG_COORDS.lat) < 0.02 &&
      Math.abs(coords.lng - HELSINGBORG_COORDS.lng) < 0.02
        ? 'Helsingborg'
        : undefined);

    const knownCards = uniqueCardsById([
      ...getHomeKnownOfferCards(),
      ...deals,
      ...hotOfferCards,
      ...nearYouCards,
    ]) as OfferCardItem[];
    void fetchRecommendedNow({
      authFetch,
      city,
      coords,
      categoryName,
      take: 8,
      knownCards,
    }).then((feed) => {
      if (cancelled) return;
      const cards =
        feed && coords
          ? applyHaversineDistances(feed.cards, coords)
          : feed?.cards ?? [];
      setRecommendedNowFeed(
        feed
          ? {
              title: feed.title,
              subtitle: feed.subtitle,
              searchQuery: feed.searchQuery,
              cards,
            }
          : null
      );
      setIsLoadingRecommendedNow(false);
    });

    return () => {
      cancelled = true;
    };
    // Home card pools are snapshotted at fetch time for hours/distance enrichment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authFetch,
    isSpecificCategorySelected,
    refreshNonce,
    selectedCategory?.label,
    userCity,
  ]);

  // Recompute distances when GPS upgrades without refetching /for-you/now.
  useEffect(() => {
    if (!coords) return;
    setRecommendedNowFeed((prev) => {
      if (!prev?.cards.length) return prev;
      return { ...prev, cards: applyHaversineDistances(prev.cards, coords) };
    });
  }, [coords?.lat, coords?.lng]);

  // Fill in öppettider / distance on Rekommenderat once home catalog cards are ready.
  useEffect(() => {
    setRecommendedNowFeed((prev) => {
      if (!prev?.cards.length) return prev;
      const knownById = new Map(
        uniqueCardsById([...deals, ...hotOfferCards, ...nearYouCards]).map((card) => [
          card.id,
          card,
        ])
      );
      let changed = false;
      const merged = prev.cards.map((card) => {
        const known = knownById.get(card.id);
        if (!known) return card;
        const next = { ...card };
        if (next.openingHours == null && known.openingHours != null) {
          next.openingHours = known.openingHours;
          changed = true;
        }
        if (
          (typeof next.distanceKm !== 'number' || !Number.isFinite(next.distanceKm)) &&
          typeof known.distanceKm === 'number' &&
          Number.isFinite(known.distanceKm)
        ) {
          next.distanceKm = known.distanceKm;
          changed = true;
        }
        if (
          (typeof next.latitude !== 'number' || typeof next.longitude !== 'number') &&
          typeof known.latitude === 'number' &&
          typeof known.longitude === 'number'
        ) {
          next.latitude = known.latitude;
          next.longitude = known.longitude;
          changed = true;
        }
        return next;
      });
      const cards = coords ? applyHaversineDistances(merged, coords) : merged;
      if (
        !changed &&
        cards.every(
          (card, i) =>
            card.distanceKm === prev.cards[i]?.distanceKm &&
            card.openingHours === prev.cards[i]?.openingHours
        )
      ) {
        return prev;
      }
      return { ...prev, cards };
    });
  }, [coords, deals, hotOfferCards, nearYouCards]);

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
      setSearchHasMore(false);
      setIsSearchLoading(false);
      clearVoiceSearchOwnership();
      return;
    }

    if (!shouldFetchSearch) {
      setIsSearchLoading(false);
      return;
    }

    if (!isSearchActive) {
      setSearchResults([]);
      setSearchHasMore(false);
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
        take: SEARCH_PAGE_SIZE,
        skip: 0,
        maxHydrate: 16,
        city: userCityRef.current ?? undefined,
        knownCards: knownCardsRef.current,
      })
        .then((results) => {
          if (cancelled) return;
          // Voice/natural search owns this query — keep its relevance order.
          if (voiceQueryRef.current === trimmedSearchQuery) return;
          const next = results as CardItem[];
          setSearchResults(next);
          setSearchHasMore(next.length >= SEARCH_PAGE_SIZE);
          setHomeSearchCache(trimmedSearchQuery, next as OfferCardItem[]);
        })
        .catch(() => {
          if (cancelled) return;
          if (voiceQueryRef.current === trimmedSearchQuery) return;
          setSearchResults([]);
          setSearchHasMore(false);
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
  }, [
    clearVoiceSearchOwnership,
    isSearchActive,
    searchQuery,
    shouldFetchSearch,
    trimmedSearchQuery,
    voiceListening,
  ]);

  useEffect(() => {
    if (
      !coords ||
      !showCommittedSearchResults ||
      !isSearchActive ||
      searchResults.length === 0
    ) {
      return;
    }

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
    showCommittedSearchResults,
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

  const captureHomeScrollBeforeLeave = useCallback(() => {
    const y = Math.max(0, homeScrollYSv.value || scrollOffsetRef.current);
    scrollOffsetRef.current = y;
    setHomeScrollOffset(y);
  }, [homeScrollYSv]);

  const handleCardPress = (card: CardItem) => {
    closeSearchOverlay();
    captureHomeScrollBeforeLeave();
    setHomeSearchCache(trimmedSearchQuery, searchResults as OfferCardItem[]);
    openOfferDetail(router, card, 'index');
  };

  const handleEventPress = (event: EventFeedItem) => {
    captureHomeScrollBeforeLeave();
    openEventFeedItem(router, event, 'index');
  };

  const openSearchResultsView = useCallback(
    (view: 'all' | 'near' | 'hot') => {
      if (!trimmedSearchQuery) return;
      captureHomeScrollBeforeLeave();
      setHomeSearchCache(trimmedSearchQuery, searchResults as OfferCardItem[]);
      router.push({
        pathname: SEARCH_RESULTS_PATH,
        params: { q: trimmedSearchQuery, view },
      });
    },
    [captureHomeScrollBeforeLeave, router, searchResults, trimmedSearchQuery]
  );

  const openSeeAllWithCategory = useCallback(
    (pathname: typeof NARA_DIG_PATH | typeof HETA_ERBJUDANDEN_PATH) => {
      captureHomeScrollBeforeLeave();
      if (isSpecificCategorySelected && selectedCategory) {
        router.push({
          pathname,
          params: {
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.label,
          },
        });
        return;
      }
      router.push(pathname);
    },
    [captureHomeScrollBeforeLeave, isSpecificCategorySelected, router, selectedCategory]
  );

  const openBusinessMapFromSearch = useCallback(() => {
    if (Platform.OS === 'web') {
      void import('@/components/ui/maplibre-map.web').then((mod) => {
        mod.prefetchBusinessMapAssets();
      });
    }
    const q = searchQuery.trim();
    // Snap overlay away — reverse morph fights the map fade and feels laggy.
    snapCloseSearchOverlay();
    router.push({
      pathname: BUSINESS_MAP_PATH,
      params: q ? { q } : undefined,
    });
  }, [router, searchQuery, snapCloseSearchOverlay]);

  const openHomeMap = useCallback(() => {
    captureHomeScrollBeforeLeave();
    snapCloseSearchOverlay();
    router.push({ pathname: BUSINESS_MAP_PATH });
  }, [captureHomeScrollBeforeLeave, router, snapCloseSearchOverlay]);

  const searchDropdownExpanded = showSearchTipsDropdown || isSearchDropdownMounted;
  const searchDropdownDividerColor = theme.isDark
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.08)';

  /**
   * Header lives OUTSIDE the ScrollView so overscroll/pull can't open a gap above search.
   * Greeting collapse is driven by homeScrollYSv (Reanimated) for smooth top scrolling.
   */

  // Hero photo collapses with the greeting so nothing peeks above the stuck search bar.
  const heroCollapseStyle = useAnimatedStyle(() => {
    const collapse = Math.min(homeScrollYSv.value, homeGreetingBandHeight);
    return {
      height: Math.max(0, homeHeroBandHeight - collapse),
      opacity: interpolate(
        homeScrollYSv.value,
        [0, homeGreetingBandHeight * 0.55, homeGreetingBandHeight],
        [1, 0.35, 0],
        'clamp'
      ),
    };
  });

  const homeContentDisappearStyle = useAnimatedStyle(() => ({
    // Opacity-only — scaling the whole home tree is a major source of jank.
    opacity: interpolate(searchOverlayProgress.value, [0, 0.4], [1, 0], 'clamp'),
  }));

  const searchOverlayBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchOverlayProgress.value, [0, 0.35], [0, 1], 'clamp'),
  }));

  const searchOverlayHeaderStyle = useAnimatedStyle(() => {
    const endW = Math.max(1, searchBarEndW.value);
    return {
      position: 'absolute' as const,
      left: searchBarEndX.value,
      top: searchBarEndY.value,
      width: endW,
      zIndex: 20,
      opacity: interpolate(searchOverlayProgress.value, [0, 0.35], [0, 1], 'clamp'),
    };
  });

  const searchOverlayContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchOverlayProgress.value, [0.2, 1], [0, 1], 'clamp'),
  }));

  const renderCategoryFilterChips = (paddingHorizontal = HOME_PAGE_PAD) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {quickCategories.map((cat) => {
          const isOffersCategory = cat.id === OFFERS_CATEGORY_ID;
          const isSelected = activeCategory === cat.id;
          const chipColor = isOffersCategory
            ? OFFERS_CATEGORY_ACCENT
            : getCategoryAccentColor(cat.label);
          const chipTextColor = getOnAccentTextColor(chipColor);

          return (
            <Pressable
              key={cat.id}
              onPress={() =>
                setActiveCategory((prev) => (prev === cat.id ? ALL_CATEGORIES_ID : cat.id))
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 0,
                backgroundColor: isSelected
                  ? chipColor
                  : theme.isDark
                    ? '#1c2744'
                    : '#e8eef8',
              }}
            >
              <Ionicons
                name={cat.icon}
                size={14}
                color={isSelected ? chipTextColor : theme.textMuted}
              />
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 12,
                  fontWeight: '600',
                  color: isSelected ? chipTextColor : theme.textMuted,
                }}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderSearchTipRows = (tips: SearchTipItem[]) =>
    tips.map((tip, index) => {
      const tipKey = getSearchTipKey(tip);
      const isExpanded = expandedSearchTipKey === tipKey;
      return (
        <View
          key={`${tipKey}:${index}`}
          style={
            index < tips.length - 1
              ? {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: searchDropdownDividerColor,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: isExpanded ? 14 : 12,
                }
              : {
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: isExpanded ? 14 : 12,
                }
          }
        >
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sök ${tip.label}`}
              onPress={() => selectSearchTip(tip)}
              className="min-w-0 flex-1 flex-row items-center"
            >
              <Ionicons
                name={
                  tip.kind === 'event'
                    ? 'calendar-outline'
                    : tip.kind === 'business'
                      ? getCategoryIconName(tip.subtitle || tip.label)
                      : tip.kind === 'recent'
                        ? 'time-outline'
                        : tip.kind === 'popular'
                          ? 'trending-up-outline'
                          : 'search-outline'
                }
                size={17}
                color={
                  tip.kind === 'business'
                    ? getCategoryAccentColor(tip.subtitle || tip.label)
                    : tip.kind === 'event'
                      ? theme.eventColor
                      : theme.textMuted
                }
                style={{ marginRight: 10 }}
              />
              <View className="min-w-0 flex-1">
                <Text
                  className="text-[15px] font-medium"
                  style={{ color: theme.text }}
                  numberOfLines={1}
                >
                  {tip.label}
                </Text>
                {tip.subtitle || tip.kind === 'event' || tip.kind === 'business' ? (
                  <Text
                    className="mt-0.5 text-[11px]"
                    style={{ color: theme.textFaint }}
                    numberOfLines={1}
                  >
                    {tip.subtitle ||
                      (tip.kind === 'event'
                        ? 'Evenemang'
                        : tip.kind === 'business'
                          ? 'Företag'
                          : 'Sökning')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              accessibilityLabel={
                isExpanded ? `Dölj företag för ${tip.label}` : `Visa företag för ${tip.label}`
              }
              onPress={() => toggleSearchTipExpand(tip)}
              hitSlop={10}
              style={{
                width: 36,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
              }}
            >
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.textFaint}
              />
            </Pressable>
          </View>

          {isExpanded ? (
            <View style={{ marginTop: 12, marginLeft: 2 }}>
              {isExpandedTipLoading && expandedTipCards.length === 0 ? (
                <LoadingSpinner label="Laddar..." style={{ alignItems: 'flex-start', paddingLeft: 2 }} />
              ) : (
                <ForYouOrderCarousel
                  cards={expandedTipCards}
                  onCardPress={handleCardPress}
                  badgeLabel={tip.label}
                  badgeColor={brandInkRgba(0.75)}
                  showBadge={false}
                  showFavoriteButton
                  showActivityDots
                  businessIdsWithEvents={businessIdsWithEvents}
                  bleed={false}
                  emptyText={`Inga företag för "${tip.label}" just nu.`}
                />
              )}
            </View>
          ) : null}
        </View>
      );
    });

  const { shops: shopSearchTips, generics: genericSearchTips } = splitSearchTips(searchTips);
  const showSplitSearchTips = Boolean(searchQuery.trim()) && shopSearchTips.length > 0;
  const recentSearchTips = recentSearches.slice(0, 8).map((label) => ({
    label,
    kind: 'recent' as const,
  }));
  const visiblePopularSearches = popularSearches.slice(0, 10);

  const finishCloseLocationMenu = useCallback(() => {
    setLocationMenuMounted(false);
    setLocationMenuLan(null);
  }, []);

  const closeLocationMenu = useCallback(() => {
    setLocationMenuOpen(false);
    locationMenuProgress.value = withTiming(
      0,
      {
        duration: 160,
        easing: ReanimatedEasing.bezier(0.4, 0, 0.2, 1),
      },
      (finished) => {
        if (finished) runOnJS(finishCloseLocationMenu)();
      }
    );
  }, [finishCloseLocationMenu, locationMenuProgress]);

  const openLocationMenu = useCallback(() => {
    cancelAnimation(locationMenuProgress);
    locationMenuProgress.value = 0;
    setLocationMenuLan(regionSelection?.lan ?? null);
    setLocationMenuMounted(true);
    setLocationMenuOpen(true);
    requestAnimationFrame(() => {
      locationMenuProgress.value = withTiming(1, {
        duration: 220,
        easing: ReanimatedEasing.bezier(0.22, 1, 0.36, 1),
      });
    });
  }, [locationMenuProgress, regionSelection?.lan]);

  const locationMenuBackdropStyle = useAnimatedStyle(() => ({
    opacity: locationMenuProgress.value,
  }));

  const locationMenuDropdownStyle = useAnimatedStyle(() => ({
    opacity: interpolate(locationMenuProgress.value, [0, 0.55, 1], [0, 1, 1]),
    transform: [
      {
        translateY: interpolate(locationMenuProgress.value, [0, 1], [-28, 0]),
      },
      {
        scaleY: interpolate(locationMenuProgress.value, [0, 1], [0.92, 1]),
      },
    ],
  }));

  const locationChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(locationMenuProgress.value, [0, 1], [0, 180])}deg`,
      },
    ],
  }));

  const applyRegionCity = useCallback(
    (lan: string, city: string, lat: number, lng: number) => {
      const next: RegionSelection = { lan, city, lat, lng };
      const nextCoords = { lat, lng };
      setRegionSelectionState(next);
      userCityRef.current = city;
      setUserCity(city);
      // Instant local update — re-rank what we already have before network returns.
      setDeals((prev) =>
        prev.length
          ? sortDealsByDistance(applyHaversineDistances(prev, nextCoords))
          : prev
      );
      setNearYouCards((prev) =>
        prev.length ? applyHaversineDistances(prev, nextCoords) : prev
      );
      setHotOfferCards((prev) =>
        prev.length ? applyHaversineDistances(prev, nextCoords) : prev
      );
      setCoords(nextCoords);
      closeLocationMenu();
      // Persist off the critical path so the UI feels instant.
      void setActiveCustomLocationId(null);
      void setRegionSelection(next);
      // Soft home refresh for the new coords runs via the coords effect —
      // no full catalog invalidate / pull-to-refresh spinner.
    },
    [closeLocationMenu]
  );

  const selectRegionCity = useCallback(
    async (lan: string, city: string) => {
      if (locationPicking) return;

      // Instant path — every picker city ships with bundled coordinates, so a
      // pick never waits on (or fails with) a live geocoding service.
      const staticCoords = staticCoordsForCity(lan, city);
      if (staticCoords) {
        applyRegionCity(lan, city, staticCoords.lat, staticCoords.lng);
        return;
      }

      const query = geocodeQueryForCity(lan, city);

      // Already geocoded this city earlier (or prefetched).
      const cached = peekGeocodeCache(query);
      if (cached && isPlausibleSwedenCoordinate(cached.lat, cached.lng)) {
        applyRegionCity(lan, city, cached.lat, cached.lng);
        return;
      }

      setLocationPicking(true);
      try {
        const coordsResult = await geocodeAddressCached(query);
        if (
          !coordsResult ||
          !isPlausibleSwedenCoordinate(coordsResult.lat, coordsResult.lng)
        ) {
          showAlert('Kunde inte hitta platsen', 'Försök med en annan ort.');
          return;
        }
        applyRegionCity(lan, city, coordsResult.lat, coordsResult.lng);
      } finally {
        setLocationPicking(false);
      }
    },
    [applyRegionCity, locationPicking]
  );

  const locationMenuCities = useMemo(() => {
    if (!locationMenuLan) return [];
    return findLanByName(locationMenuLan)?.cities ?? [];
  }, [locationMenuLan]);

  // Prefetch coords for the rare picker city without bundled coordinates.
  useEffect(() => {
    if (!locationMenuMounted || !locationMenuLan) return;
    const cities = (findLanByName(locationMenuLan)?.cities ?? []).filter(
      (city) => !staticCoordsForCity(locationMenuLan, city)
    );
    if (cities.length === 0) return;

    let cancelled = false;
    const queue = [...cities];
    const workers = Math.min(3, queue.length);

    const runWorker = async () => {
      while (!cancelled && queue.length > 0) {
        const city = queue.shift();
        if (!city) return;
        const query = geocodeQueryForCity(locationMenuLan, city);
        if (peekGeocodeCache(query)) continue;
        await geocodeAddressCached(query);
      }
    };

    void Promise.all(Array.from({ length: workers }, () => runWorker()));
    return () => {
      cancelled = true;
    };
  }, [locationMenuLan, locationMenuMounted]);

  const renderHomeGreeting = () => (
    <View
      nativeID="home-greeting"
      style={[
        styles.searchHeaderRoot,
        {
          height: homeGreetingBandHeight,
          backgroundColor: 'transparent',
          paddingHorizontal: HOME_PAGE_PAD,
          // Column layout keeps Upptäck + kommun fully above the search bar
          // (absolute bottom + overflow was clipping the title on iPhone).
          justifyContent: 'space-between',
          paddingTop: 8,
          paddingBottom: 10,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.homeHeroTopRow} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Plats: ${homeLocationLabel}. Tryck för att byta.`}
          onPress={openLocationMenu}
          hitSlop={8}
          style={styles.homeLocationButton}
        >
          {Platform.OS !== 'web' ? (
            <BlurView
              key={locationBlurKey}
              tint="systemThinMaterialDark"
              intensity={Platform.OS === 'android' ? 64 : 40}
              experimentalBlurMethod={
                Platform.OS === 'android' ? 'dimezisBlurView' : undefined
              }
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <View
              key={locationBlurKey}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.homeLocationBlurWeb,
              ]}
            />
          )}
          <Ionicons name="location-sharp" size={13} color="#ffffff" />
          <Text numberOfLines={1} style={styles.homeLocationLabel}>
            {homeLocationLabel}
          </Text>
          <Reanimated.View style={locationChevronStyle}>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.92)" />
          </Reanimated.View>
        </Pressable>

        <View style={styles.homeHeroBrand} pointerEvents="none">
          <View style={styles.homeHeroBrandMark}>
            <Text style={styles.homeHeroBrandText}>TooDoo</Text>
            <Svg
              width={24}
              height={8}
              viewBox="0 0 24 8"
              style={styles.homeHeroBrandSmile}
            >
              <Path
                d="M2 2 C7.5 6.5, 16.5 6.5, 22 2"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Upptäck ${homeKommunLabel}`}
        onPress={() =>
          selectHomeTipCard({
            id: `discover:${homeKommunLabel}`,
            eyebrow: 'Upptäck',
            title: homeKommunLabel,
            query: homeKommunLabel,
          })
        }
        style={styles.homeHeroCopy}
      >
        <Text numberOfLines={1} style={styles.homeHeroEyebrow}>
          Upptäck
        </Text>
        <Text numberOfLines={1} style={styles.homeHeroTitle}>
          {homeKommunLabel}
        </Text>
      </Pressable>

      <Modal
        visible={locationMenuMounted}
        transparent
        animationType="none"
        onRequestClose={closeLocationMenu}
      >
        <View style={styles.locationMenuRoot} pointerEvents="box-none">
          <Reanimated.View
            style={[styles.locationMenuBackdrop, locationMenuBackdropStyle]}
          >
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={closeLocationMenu}
              accessibilityRole="button"
              accessibilityLabel="Stäng platsmeny"
            />
          </Reanimated.View>
          <Reanimated.View
            style={[
              styles.locationMenuDropdown,
              {
                paddingTop: homeHeaderInset + 8,
                backgroundColor: theme.isDark ? '#152847' : '#d4e4f5',
                borderBottomColor: theme.isDark
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(19,23,32,0.12)',
              },
              locationMenuDropdownStyle,
            ]}
          >
            <View style={styles.locationMenuHeaderRow}>
              {locationMenuLan ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka till län"
                  onPress={() => setLocationMenuLan(null)}
                  hitSlop={8}
                  style={styles.locationMenuBack}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.text} />
                </Pressable>
              ) : null}
              <Text style={[styles.locationMenuTitle, { color: theme.text }]}>
                {locationMenuLan ? 'Välj stad' : 'Välj län'}
              </Text>
              {locationPicking ? (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Hämtar...</Text>
              ) : null}
            </View>
            <ScrollView
              style={styles.locationMenuList}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {locationMenuLan
                ? locationMenuCities.map((city) => {
                    const selected =
                      regionSelection?.lan === locationMenuLan &&
                      regionSelection?.city === city;
                    return (
                      <Pressable
                        key={city}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={locationPicking}
                        onPress={() => void selectRegionCity(locationMenuLan, city)}
                        style={styles.locationMenuRow}
                      >
                        <Ionicons
                          name="location-outline"
                          size={18}
                          color={selected ? theme.primary : theme.textMuted}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.locationMenuRowLabel,
                            {
                              color: selected ? theme.text : theme.textMuted,
                              fontWeight: selected ? '700' : '500',
                            },
                          ]}
                        >
                          {city}
                        </Text>
                        {selected ? (
                          <Ionicons name="checkmark" size={18} color={theme.primary} />
                        ) : null}
                      </Pressable>
                    );
                  })
                : SWEDEN_REGIONS.map((lan) => {
                    const selected = regionSelection?.lan === lan.name;
                    return (
                      <Pressable
                        key={lan.name}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setLocationMenuLan(lan.name)}
                        style={styles.locationMenuRow}
                      >
                        <Ionicons
                          name="map-outline"
                          size={18}
                          color={selected ? theme.primary : theme.textMuted}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.locationMenuRowLabel,
                            {
                              color: selected ? theme.text : theme.textMuted,
                              fontWeight: selected ? '700' : '500',
                            },
                          ]}
                        >
                          {lan.name}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </Reanimated.View>
        </View>
      </Modal>
    </View>
  );

  const renderHomeSearchHeader = () => (
    <View
      style={[styles.searchHeaderSticky, { backgroundColor: 'transparent' }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.searchBarAnchor,
          {
            width: '100%',
            paddingHorizontal: HOME_PAGE_PAD,
            marginLeft: 0,
            zIndex: 3,
            paddingBottom: 6,
          },
        ]}
      >
        <View
          style={[
            styles.searchBarWithMicRow,
            { opacity: isSearchOverlayMounted ? 0 : 1 },
          ]}
          pointerEvents={isSearchOverlayMounted ? 'none' : 'auto'}
        >
          <View ref={homeSearchBarRef} collapsable={false} style={styles.homeHeaderSearchWrap}>
            <View
              style={[filterSurfaceStyle, styles.searchBarRow, styles.homeHeaderSearchBar]}
            >
              <Pressable
                accessibilityRole="search"
                accessibilityLabel="Öppna sök"
                onPress={() => openSearchDropdown()}
                style={styles.homeHeaderSearchHit}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color={FilterChipTheme.textMuted}
                  style={styles.searchBarIcon}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    lineHeight: 20,
                    letterSpacing: -0.1,
                    color: searchQuery.trim()
                      ? FilterChipTheme.text
                      : FilterChipTheme.placeholder,
                  }}
                >
                  {searchQuery.trim() || 'Vad vill du göra?'}
                </Text>
              </Pressable>
              <InlineMicButton
                variant="field"
                listening={voiceListening}
                onPress={handleVoiceSearch}
                accessibilityLabel={voiceListening ? 'Stoppa röstsökning' : 'Sök med rösten'}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Karta"
            onPress={openHomeMap}
            style={styles.homeHeaderMapButton}
          >
            <Ionicons name="map" size={22} color="#ffffff" />
          </Pressable>
        </View>
        <View style={{ marginTop: 10, marginHorizontal: -HOME_PAGE_PAD }}>
          {renderCategoryFilterChips()}
        </View>
        {voiceListening || voiceSpeaking || voiceStatusMessage ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 8,
              paddingHorizontal: 4,
              fontSize: 12,
              fontWeight: '600',
              color: voiceListening ? OFFERS_CATEGORY_ACCENT : theme.textMuted,
            }}
          >
            {voiceStatusMessage ??
              (voiceListening
                ? 'Lyssnar… tappa mikrofonen för att stoppa'
                : voiceSpeaking
                  ? 'Hörde dig…'
                  : '')}
          </Text>
        ) : null}
      </View>

    </View>
  );

  const renderSearchOverlay = () => (
    <Modal
      visible={isSearchOverlayMounted}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={closeSearchOverlay}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <Reanimated.View
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.screenBg },
            searchOverlayBackdropStyle,
          ]}
        />

        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: SEARCH_OVERLAY_SIDE_PAD,
            zIndex: 100,
            width: SEARCH_OVERLAY_BACK_SIZE,
            height: SEARCH_OVERLAY_BACK_SIZE,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stäng sök"
            onPress={closeSearchOverlay}
            hitSlop={12}
            style={[
              filterSurfaceStyle,
              {
                width: SEARCH_OVERLAY_BACK_SIZE,
                height: SEARCH_OVERLAY_BACK_SIZE,
                borderRadius: HOME_RADIUS,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Ionicons name="chevron-back" size={28} color={FilterChipTheme.text} />
          </Pressable>
        </View>

        <Reanimated.View
          pointerEvents="auto"
          style={[
            {
              position: 'absolute',
              top: insets.top + 8,
              right: SEARCH_OVERLAY_SIDE_PAD,
              zIndex: 100,
              width: SEARCH_OVERLAY_MAP_BUTTON_SIZE,
              height: SEARCH_OVERLAY_MAP_BUTTON_SIZE,
            },
            searchOverlayContentStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Visa på karta"
            onPress={openBusinessMapFromSearch}
            style={[
              filterSurfaceStyle,
              {
                width: SEARCH_OVERLAY_MAP_BUTTON_SIZE,
                height: SEARCH_OVERLAY_MAP_BUTTON_SIZE,
                borderRadius: HOME_RADIUS,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Ionicons name="map-outline" size={20} color={FilterChipTheme.text} />
          </Pressable>
        </Reanimated.View>

        <Reanimated.View style={searchOverlayHeaderStyle} pointerEvents="box-none">
          <View
            style={[
              filterSurfaceStyle,
              styles.searchBarRow,
              {
                width: '100%',
                height: SEARCH_BAR_HEIGHT,
                paddingRight: 6,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={FilterChipTheme.textMuted}
              style={styles.searchBarIcon}
            />
            <View style={styles.searchBarInputSlot}>
              <TextInput
                autoFocus={searchInputReady}
                value={searchQuery}
                onChangeText={(text) => {
                  clearVoiceSearchOwnership();
                  setSearchCommitted(false);
                  setSearchQuery(text);
                }}
                onSubmitEditing={() => {
                  if (searchQuery.trim().length < 2) return;
                  rememberSearch(searchQuery);
                  setSearchCommitted(true);
                  closeSearchOverlay();
                }}
                placeholder="Vad vill du göra?"
                placeholderTextColor={FilterChipTheme.placeholder}
                style={[
                  styles.searchBarInput,
                  {
                    color: FilterChipTheme.text,
                    height: SEARCH_BAR_HEIGHT,
                    letterSpacing: -0.1,
                  },
                ]}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            <Pressable
              onPress={() => {
                clearVoiceSearchOwnership();
                stopVoiceSession();
                setSearchCommitted(false);
                setSearchQuery('');
                setSearchResults([]);
                setSearchHasMore(false);
                clearHomeSearchCache();
              }}
              style={[
                styles.searchBarClearButton,
                { opacity: searchQuery.trim() ? 1 : 0 },
              ]}
              pointerEvents={searchQuery.trim() ? 'auto' : 'none'}
              disabled={!searchQuery.trim()}
            >
              <Ionicons name="close-circle" size={24} color={FilterChipTheme.textMuted} />
            </Pressable>
            <InlineMicButton
              variant="field"
              listening={voiceListening}
              onPress={handleVoiceSearch}
              accessibilityLabel={voiceListening ? 'Stoppa röstsökning' : 'Sök med rösten'}
            />
          </View>
        </Reanimated.View>

        <Reanimated.View
          pointerEvents="auto"
          style={[
            {
              position: 'absolute' as const,
              top: insets.top + SEARCH_BAR_HEIGHT + 18,
              left: 0,
              right: 0,
              zIndex: 90,
            },
            searchOverlayContentStyle,
          ]}
        >
          {renderCategoryFilterChips(SEARCH_OVERLAY_SIDE_PAD)}
        </Reanimated.View>

        <Reanimated.View
          style={[
            {
              flex: 1,
              marginTop: insets.top + SEARCH_BAR_HEIGHT + 66,
            },
            searchOverlayContentStyle,
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {!searchQuery.trim() ? (
              <>
                {recentSearchTips.length > 0 ? (
                  <View style={{ paddingTop: 4 }}>
                    <Text
                      className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: theme.textFaint }}
                    >
                      Senaste sökningar
                    </Text>
                    {renderSearchTipRows(recentSearchTips)}
                  </View>
                ) : null}
                {visiblePopularSearches.length > 0 ? (
                  <View style={{ paddingTop: recentSearchTips.length > 0 ? 18 : 4 }}>
                    <Text
                      className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: theme.textFaint }}
                    >
                      Populära sökningar
                    </Text>
                    {renderSearchTipRows(visiblePopularSearches)}
                  </View>
                ) : null}
              </>
            ) : searchTips.length > 0 ? (
              showSplitSearchTips ? (
                <>
                  <View style={{ paddingTop: 4 }}>
                    <Text
                      className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: theme.textFaint }}
                    >
                      Sökförslag
                    </Text>
                    {renderSearchTipRows(shopSearchTips)}
                  </View>
                  {genericSearchTips.length > 0 ? (
                    <View style={{ paddingTop: 18 }}>
                      <Text
                        className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: theme.textFaint }}
                      >
                        Populärt
                      </Text>
                      {renderSearchTipRows(genericSearchTips)}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={{ paddingTop: 4 }}>
                  <Text
                    className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: theme.textFaint }}
                  >
                    Sökförslag
                  </Text>
                  {renderSearchTipRows(searchTips)}
                </View>
              )
            ) : null}
          </ScrollView>
        </Reanimated.View>
      </View>
    </Modal>
  );


  return (
    <View
      nativeID="home-header-shell"
      style={{
        flex: 1,
        backgroundColor: homeScreenBg,
      }}
    >
      {/*
        Pinned header outside the ScrollView — overscroll can never open a gap above search.
        Greeting height collapses with scroll; search stays put under the status inset.
      */}
      <View
        nativeID="home-search-panel"
        className={Platform.OS === 'web' ? 'home-pinned-header' : undefined}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: searchDropdownExpanded ? 200 : 30,
          backgroundColor: showStickyExploreFilter ? homeScreenBg : homeHeaderPanelBg,
          overflow: 'hidden',
          borderBottomWidth: 0,
          ...(Platform.OS === 'web'
            ? ({ ['--home-mesh-shift' as string]: '0px' } as const)
            : null),
        }}
        pointerEvents="box-none"
      >
        {/*
          Banner lives only in this chrome block (inset + greeting + search).
          Sticky Utforska is a sibling below so attaching filters never changes banner height/aspect.
        */}
        <View
          style={{
            position: 'relative',
            backgroundColor: homeScreenBg,
          }}
        >
          {/* Image is full-bleed from the screen top — chrome pads into it so
              safe-area never leaves a black band above the photo. */}
          <Reanimated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 0,
                overflow: 'hidden',
              },
              heroCollapseStyle,
            ]}
          >
            <View
              collapsable={false}
              nativeID="home-hero-photo"
              style={{
                height: homeHeroBandHeight,
                width: '100%',
              }}
            >
              <HomeHeaderHeroFill
                fadeTo={homeScreenBg}
                imageUris={cityHeroUris}
                onActiveIndexChange={onCityHeroIndexChange}
              />
            </View>
          </Reanimated.View>
          <View
            style={[
              {
                zIndex: 1,
                paddingTop: homeHeaderInset,
              },
              Platform.OS === 'web'
                ? ({
                    // Real island/notch only — no invented gap when env is 0.
                    paddingTop: `max(${homeHeaderInset}px, env(safe-area-inset-top, 0px))`,
                  } as object)
                : null,
            ]}
            pointerEvents="box-none"
          >
            <Reanimated.View style={greetingCollapseStyle} pointerEvents="box-none">
              {renderHomeGreeting()}
            </Reanimated.View>
          </View>
          <View
            style={{ zIndex: 1, backgroundColor: homeScreenBg }}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 40) setSearchPanelHeight(h);
            }}
          >
            {renderHomeSearchHeader()}
          </View>
        </View>
        {showStickyExploreFilter ? (
          <View
            style={{
              zIndex: 2,
              alignSelf: 'stretch',
              width: '100%',
              // Pull into the banner fade so the seam isn't a hard cut.
              marginTop: -10,
              paddingTop: 12,
              paddingBottom: 6,
              backgroundColor: homeScreenBg,
            }}
          >
            <ExploreFilterPanel
              sticky
              value={exploreFilters}
              subcategories={exploreSubcategories}
              onChange={setExploreFilters}
            />
          </View>
        ) : null}
      </View>

      <Reanimated.View
        className="flex-1"
        pointerEvents={isSearchOverlayMounted ? 'none' : 'auto'}
        style={[
          styles.screen,
          { backgroundColor: homeScreenBg, flex: 1 },
          isSearchOverlayMounted ? homeContentDisappearStyle : null,
        ]}
      >
        <Reanimated.ScrollView
          ref={scrollRef}
          nativeID="home-scroll"
          className="flex-1"
          style={[styles.scroll, { backgroundColor: homeHeaderMeshBase }]}
          contentContainerStyle={{
            // Spacer matches full expanded header so greeting collapse stays in sync with scroll.
            paddingTop: homeHeroBandHeight + searchPanelHeight,
            paddingBottom: scrollBottomPadding,
            flexGrow: 1,
            backgroundColor: homeScreenBg,
            ...(Platform.OS === 'web' ? { width: '100%' as const, alignSelf: 'stretch' as const } : null),
          }}
          onScroll={onHomeScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressViewOffset={homeHeroBandHeight + searchPanelHeight}
            />
          }
        >
        <View style={{ marginTop: 0, paddingTop: 16, paddingHorizontal: HOME_PAGE_PAD, backgroundColor: homeScreenBg, flexGrow: 1 }}>
          {showCommittedSearchResults || showCommittedSearchPrompt ? (
            <>
              <SectionTitleRow
                title="Sökresultat"
                onSeeAllPress={() => openSearchResultsView('all')}
              />
              {isSearchTooShort ? (
                <Text style={{ color: theme.textMuted }}>Skriv minst 2 tecken för att söka.</Text>
              ) : isSearchLoading ? (
                <LoadingSpinner label="Söker..." />
              ) : (
                <>
                  <ForYouOrderCarousel
                    cards={searchResults}
                    onCardPress={handleCardPress}
                    badgeLabel="Träff"
                    badgeColor={brandInkRgba(0.75)}
                    getBadgeLabel={getSearchResultBadge}
                    getBadgeColor={(card) =>
                      card.resultKind === 'event' ? theme.eventColor : brandInkRgba(0.75)
                    }
                    showBadge={false}
                    showFavoriteButton
                    scrollKey="home:search:all"
                    emptyText={`Inga träffar för "${trimmedSearchQuery}".`}
                  />

                  {searchResults.length > 0 ? (
                    <>
                      <View style={{ marginTop: 26 }}>
                        <SectionTitleRow
                          title="Populärt just nu"
                          subtitle="Baserat på din sökning"
                          onSeeAllPress={() => openSearchResultsView('hot')}
                        />
                        <FeaturedDealsSplit
                          cards={searchedHot}
                          onCardPress={handleCardPress}
                          emptyText={`Inga populära erbjudanden för "${trimmedSearchQuery}".`}
                        />
                      </View>

                      <View style={{ marginTop: 26 }}>
                        <SectionTitleRow
                          title="Nära dig"
                          onSeeAllPress={() => openSearchResultsView('near')}
                        />
                        <ForYouOrderCarousel
                          cards={searchedNearYou}
                          onCardPress={handleCardPress}
                          badgeLabel="Nära dig"
                          badgeColor={brandInkRgba(0.75)}
                          getBadgeLabel={getNearbyBadge}
                          getBadgeColor={(card) =>
                            card.resultKind === 'event' ? theme.eventColor : brandInkRgba(0.75)
                          }
                          showActivityDots
                          businessIdsWithEvents={businessIdsWithEvents}
                          scrollKey="home:search:near"
                          emptyText={`Inga träffar nära dig för "${trimmedSearchQuery}".`}
                        />
                      </View>

                      <View style={{ marginTop: 26 }}>
                        <SectionTitleRow title="Fler träffar" />
                        <HomeCardGrid
                          cards={searchResults}
                          onCardPress={handleCardPress}
                          emptyText={`Inga fler träffar för "${trimmedSearchQuery}".`}
                          maxItems={null}
                          columns={1}
                          showFavoriteButton
                        />
                        {isLoadingMoreSearch ? (
                          <LoadingSpinner label="Laddar fler..." style={{ marginTop: 8 }} />
                        ) : searchHasMore ? (
                          <Text
                            style={{
                              color: theme.textMuted,
                              textAlign: 'center',
                              marginTop: 14,
                              marginBottom: 4,
                              fontSize: 13,
                            }}
                          >
                            Scrolla för fler träffar
                          </Text>
                        ) : searchResults.length > 0 ? (
                          <Text
                            style={{
                              color: theme.textMuted,
                              textAlign: 'center',
                              marginTop: 14,
                              marginBottom: 4,
                              fontSize: 13,
                            }}
                          >
                            Inga fler träffar
                          </Text>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <View style={{ marginTop: 8 }}>
                <SectionTitleRow
                  title={recommendedNowSubtitle || recommendedNowTitle}
                  onSeeAllPress={() => {
                    const city = resolveEventFeedCity(userCity, coords);
                    router.push({
                      pathname: SEARCH_RESULTS_PATH,
                      params: {
                        source: 'now',
                        ...(city ? { city } : {}),
                        ...(isSpecificCategorySelected && selectedCategory
                          ? {
                              categoryId: selectedCategory.id,
                              categoryName: selectedCategory.label,
                            }
                          : {}),
                      },
                    });
                  }}
                />
                {isLoadingRecommendedNow && recommendedNowCards.length === 0 ? (
                  <LoadingSpinner label="Laddar..." />
                ) : (
                  <ForYouOrderCarousel
                    cards={recommendedNowCards}
                    onCardPress={handleCardPress}
                    badgeLabel=""
                    badgeColor={brandInkRgba(0.75)}
                    showBadge={false}
                    showFavoriteButton
                    scrollKey="home:recommended"
                    emptyText="Inga förslag just nu."
                  />
                )}
              </View>

              {isSpecificCategorySelected && selectedCategory ? (
                <View style={{ marginTop: 14 }}>
                  <SectionTitleRow
                    title={selectedCategory.label}
                    onSeeAllPress={() => openSeeAllWithCategory(NARA_DIG_PATH)}
                  />
                  {isLoadingData && selectedCategoryCards.length === 0 ? (
                    <LoadingSpinner label="Laddar..." />
                  ) : (
                    <ForYouOrderCarousel
                      cards={selectedCategoryCards}
                      onCardPress={handleCardPress}
                      badgeLabel={selectedCategory.label}
                      badgeColor={getCategoryAccentColor(selectedCategory.label)}
                      showFavoriteButton
                      scrollKey={`home:category:${selectedCategory.id}`}
                      emptyText={`Inga träffar i ${selectedCategory.label} just nu.`}
                    />
                  )}
                </View>
              ) : null}

              <View style={{ marginTop: 14 }}>
                <SectionTitleRow
                  title="Populärt just nu"
                  onSeeAllPress={() => openSeeAllWithCategory(HETA_ERBJUDANDEN_PATH)}
                />
                {isLoadingData && hotOfferCards.length === 0 ? (
                  <LoadingSpinner label="Laddar..." />
                ) : (
                  <AnimatedFeaturedDeals
                    cards={filteredHotOfferCards}
                    onCardPress={handleCardPress}
                    emptyText="Inga populära erbjudanden just nu."
                  />
                )}
              </View>

              <View style={{ marginTop: 14 }}>
                <SectionTitleRow
                  title="Evenemang"
                  onSeeAllPress={() => router.push(EVENEMANG_PATH)}
                />
                {isLoadingEvents && eventCards.length === 0 ? (
                  <LoadingSpinner label="Laddar..." />
                ) : (
                  <HomeEventTickets
                    events={eventCards}
                    onEventPress={handleEventPress}
                    emptyText="Inga evenemang just nu."
                  />
                )}
              </View>

              <View style={{ marginTop: 14 }}>
                <SectionTitleRow
                  title="Nära dig"
                  onSeeAllPress={() => openSeeAllWithCategory(NARA_DIG_PATH)}
                />
                {isLoadingData && filteredDeals.length === 0 ? (
                  <LoadingSpinner label="Laddar..." />
                ) : (
                  <ForYouOrderCarousel
                    cards={filteredDeals}
                    onCardPress={handleCardPress}
                    badgeLabel="Nära dig"
                    badgeColor={brandInkRgba(0.75)}
                    getBadgeLabel={getNearbyBadge}
                    getBadgeColor={(card) =>
                      card.resultKind === 'event' ? theme.eventColor : brandInkRgba(0.75)
                    }
                    showFavoriteButton
                    compact
                    scrollKey="home:near"
                    emptyText="Inga erbjudanden nära dig just nu."
                  />
                )}
              </View>

              {recentCompanies.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <SectionTitleRow title="Senast besökt" />
                  <HomeRecentCompanies
                    cards={recentCompanies}
                    onCardPress={handleCardPress}
                  />
                </View>
              ) : null}

              {lunchCards.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <SectionTitleRow
                    title="Lunch"
                    onSeeAllPress={() =>
                      router.push({ pathname: SEARCH_RESULTS_PATH, params: { q: 'lunch' } })
                    }
                  />
                  <ForYouOrderCarousel
                    cards={lunchCards}
                    onCardPress={handleCardPress}
                    badgeLabel=""
                    badgeColor={brandInkRgba(0.75)}
                    showBadge={false}
                    compact
                    scrollKey="home:lunch"
                    emptyText="Inga lunchförslag just nu."
                  />
                </View>
              ) : null}

              {weekendStripCards.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <SectionTitleRow
                    title="Till helgen"
                    onSeeAllPress={() =>
                      weekendEvents.length > 0
                        ? router.push(EVENEMANG_PATH)
                        : router.push({ pathname: SEARCH_RESULTS_PATH, params: { q: 'helgen' } })
                    }
                  />
                  <ForYouOrderCarousel
                    cards={weekendStripCards}
                    onCardPress={handleCardPress}
                    badgeLabel="Evenemang"
                    badgeColor={theme.eventColor}
                    getBadgeLabel={(card) =>
                      card.resultKind === 'event' ? 'Evenemang' : ''
                    }
                    getBadgeColor={(card) =>
                      card.resultKind === 'event' ? theme.eventColor : brandInkRgba(0.75)
                    }
                    compact
                    scrollKey="home:weekend"
                    emptyText="Inga helgtips just nu."
                  />
                </View>
              ) : null}

              {categorySpotlightSections.map((section) => (
                <View key={`spotlight:${section.id}`} style={{ marginTop: 14 }}>
                  <SectionTitleRow
                    title={section.label}
                    onSeeAllPress={() =>
                      router.push({
                        pathname: NARA_DIG_PATH,
                        params: {
                          categoryId: section.id,
                          categoryName: section.label,
                        },
                      })
                    }
                  />
                  <ForYouOrderCarousel
                    cards={section.cards}
                    onCardPress={handleCardPress}
                    badgeLabel=""
                    badgeColor={brandInkRgba(0.75)}
                    showBadge={false}
                    compact
                    scrollKey={`home:spotlight:${section.id}`}
                    emptyText={`Inga träffar i ${section.label} just nu.`}
                  />
                </View>
              ))}

              {afterShoppingSections.map((section) => (
                <View key={`after-shopping:${section.id}`} style={{ marginTop: 14 }}>
                  <SectionTitleRow
                    title={section.label}
                    onSeeAllPress={() =>
                      router.push({
                        pathname: NARA_DIG_PATH,
                        params: {
                          categoryId: section.id,
                          categoryName: section.label,
                        },
                      })
                    }
                  />
                  <ForYouOrderCarousel
                    cards={section.cards}
                    onCardPress={handleCardPress}
                    badgeLabel=""
                    badgeColor={brandInkRgba(0.75)}
                    showBadge={false}
                    compact
                    scrollKey={`home:after-shopping:${section.id}`}
                    emptyText={`Inga träffar i ${section.label} just nu.`}
                  />
                </View>
              ))}

              <View
                style={{ marginTop: 22 }}
                onLayout={(e) => {
                  exploreBlockYRef.current = e.nativeEvent.layout.y;
                  updateExploreFilterAnchorY();
                }}
              >
                <SectionTitleRow title="Utforska" />
                <View
                  onLayout={(e) => {
                    exploreFilterOffsetInBlockRef.current = e.nativeEvent.layout.y;
                    updateExploreFilterAnchorY();
                  }}
                  pointerEvents={showStickyExploreFilter ? 'none' : 'auto'}
                  style={showStickyExploreFilter ? { opacity: 0 } : undefined}
                >
                  <ExploreFilterPanel
                    value={exploreFilters}
                    subcategories={exploreSubcategories}
                    onChange={setExploreFilters}
                  />
                </View>
                <View style={{ marginTop: 14 }}>
                  {isLoadingExplore && exploreCards.length === 0 ? (
                    <LoadingSpinner label="Laddar bolag..." />
                  ) : (
                    <>
                      <HomeCardGrid
                        cards={exploreCards}
                        onCardPress={handleCardPress}
                        emptyText="Inga bolag matchar filtret just nu."
                        maxItems={null}
                        columns={1}
                        showFavoriteButton
                      />
                      {isLoadingMoreExplore ? (
                        <LoadingSpinner label="Laddar fler..." style={{ marginTop: 8 }} />
                      ) : exploreCards.length > 0 ? (
                        <Text
                          style={{
                            color: theme.textMuted,
                            textAlign: 'center',
                            marginTop: 14,
                            marginBottom: 4,
                            fontSize: 13,
                          }}
                        >
                          Scrolla för fler bolag
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>

        </Reanimated.ScrollView>
      </Reanimated.View>
      {renderSearchOverlay()}
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
    overflow: 'hidden',
  },
  searchHeaderSticky: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    zIndex: 1,
    paddingBottom: 4,
  },
  homeHeroTopRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
    minHeight: 36,
  },
  homeHeroBrand: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  homeHeroBrandMark: {
    alignItems: 'center',
  },
  homeHeroBrandText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  homeHeroBrandSmile: {
    marginTop: 1,
  },
  homeHeroCopy: {
    zIndex: 2,
    paddingRight: 8,
  },
  homeHeroEyebrow: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  homeHeroTitle: {
    marginTop: 2,
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    // Keep room for descenders (g/y/p) — tight lineHeight clips them under overflow:hidden.
    lineHeight: 40,
    includeFontPadding: false,
  },
  homeLocationButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,15,28,0.28)',
  },
  homeLocationBlurWeb: {
    backgroundColor: 'rgba(10,15,28,0.22)',
    // @ts-expect-error web backdrop blur
    backdropFilter: 'blur(16px) saturate(150%)',
    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
  },
  homeLocationLabel: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
    includeFontPadding: false,
  },
  locationMenuRoot: {
    flex: 1,
  },
  locationMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 28, 0.35)',
  },
  locationMenuDropdown: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: HOME_PAGE_PAD,
    maxHeight: '58%',
    overflow: 'hidden',
    // @ts-expect-error web transform-origin for scaleY dropdown feel
    transformOrigin: 'top center',
  },
  locationMenuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    minHeight: 28,
  },
  locationMenuBack: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  locationMenuTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  locationMenuList: {
    flexGrow: 0,
  },
  locationMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  locationMenuRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  searchBarAnchor: {
    position: 'relative',
    maxWidth: '100%',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: HOME_RADIUS,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  searchBarIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  searchBarWithMicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  homeHeaderSearchWrap: {
    flex: 1,
    minWidth: 0,
  },
  homeHeaderSearchBar: {
    height: SEARCH_BAR_HEIGHT,
    paddingRight: 6,
  },
  homeHeaderSearchHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  homeHeaderMapButton: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: HOME_RADIUS,
    backgroundColor: BrandColors.dark.primary,
  },
  searchBarDropdownHost: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
    overflow: 'visible',
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
    fontSize: 15,
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
    marginLeft: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
});
