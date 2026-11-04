import type { ImageSourcePropType } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { businessImageCacheKey, extractOrderImageUrl } from '@/lib/business-image';
import {
  fetchApprovedBusinessesCatalog,
  fetchCategoriesCatalog,
  peekApprovedBusinessesCatalog,
} from '@/lib/catalog-cache';
import { getCategoryAccentForItem } from '@/lib/category-colors';
import {
  cityImageUrisFromRows,
  primeCityImageUris,
  type CityImage,
} from '@/lib/city-images';
import type { EventFeedItem } from '@/lib/events-feed';
import { applyHaversineDistances } from '@/lib/geo';
import { mapApiMunicipioEvent } from '@/lib/municipio-events';
import { isWithinOrderPublishWindow } from '@/lib/order-claim-window';

export type OfferCardItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  categoryId?: string;
  /** All assigned category ids (primary + secondary). Used for multi-tag filtering. */
  categoryIds?: string[];
  categoryName?: string;
  /** All assigned category labels when a business has more than one. */
  categoryNames?: string[];
  /** Hidden cuisine/type label from business.subcategory (e.g. Pizza, Kebab). */
  subcategoryName?: string;
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
  /** Raw business opening-hours payload (normalized at display time). */
  openingHours?: unknown;
  /** Per-offer image URIs used when expanding one business card into many offers. */
  orderImageUris?: string[];
  /**
   * Unified search / for-you/now may return events (`type: "event"`).
   * Cached public events use `cached_event` id; `BUSINESS` uses `business_event` id.
   */
  resultKind?: 'business' | 'event';
  eventSource?: 'MUNICIPIO' | 'VISIT_SWEDEN' | 'BUSINESS';
};

type ApiBusinessCategory = {
  id?: string;
  _id?: string;
  name?: string;
  icon?: string;
  subcategories?: Array<{ id?: string; name?: string; slug?: string | null } | string>;
};

type ApiBusiness = {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  city?: string;
  imageUrl?: string;
  categoryId?: string;
  categoryName?: string;
  categories?: Array<ApiBusinessCategory | string>;
  categoryIds?: string[];
  status?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: unknown;
  category?: { id?: string; name?: string };
};

/**
 * First subcategory label from the nested business shape:
 * categories[].subcategories[] (parents only in categoryNames).
 */
export function resolveBusinessSubcategoryName(business: any): string | undefined {
  const categories = Array.isArray(business?.categories) ? business.categories : [];
  for (const category of categories) {
    if (!category || typeof category !== 'object') continue;
    const children = Array.isArray(category.subcategories) ? category.subcategories : [];
    for (const child of children) {
      if (typeof child === 'string' && child.trim()) return child.trim();
      if (child && typeof child === 'object' && typeof child.name === 'string' && child.name.trim()) {
        return child.name.trim();
      }
    }
  }
  // Legacy / search fallbacks
  if (typeof business?.subcategory?.name === 'string' && business.subcategory.name.trim()) {
    return business.subcategory.name.trim();
  }
  if (typeof business?.subcategoryName === 'string' && business.subcategoryName.trim()) {
    return business.subcategoryName.trim();
  }
  return undefined;
}

function pickAt<T>(arr: T[] | undefined, index: number): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[index] ?? arr[0];
}

export function resolveBusinessIdFromOrder(order: any): string | undefined {
  const business = order?.business ?? {};
  const id =
    typeof order?.businessId === 'string' && order.businessId
      ? order.businessId
      : order?.businessId?.id ??
        order?.businessId?._id ??
        business?.id ??
        business?._id;
  return id ? String(id) : undefined;
}

/** Collect primary + secondary category ids from a business API record. */
export function resolveBusinessCategoryIds(business: any): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown) => {
    if (raw == null) return;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const id = String(raw).trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
      return;
    }
    if (typeof raw === 'object') {
      const obj = raw as { id?: unknown; _id?: unknown };
      const nested = obj.id ?? obj._id;
      if (nested == null) return;
      const normalized = String(nested).trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      ids.push(normalized);
    }
  };

  if (Array.isArray(business?.categoryIds)) {
    business.categoryIds.forEach(push);
  }
  if (Array.isArray(business?.categories)) {
    business.categories.forEach(push);
  }
  push(business?.categoryId);
  push(business?.category);

  return ids;
}

/** Collect every category label on a business (arrays + primary + id map). */
export function resolveBusinessCategoryNames(
  business: any,
  categoryNameById?: Map<string, string>
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown) => {
    let name = '';
    if (typeof raw === 'string') name = raw.trim();
    else if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
      name = String((raw as { name: string }).name).trim();
    }
    if (!name) return;
    const key = name.toLocaleLowerCase('sv-SE');
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  if (Array.isArray(business?.categoryNames)) {
    business.categoryNames.forEach(push);
  }
  if (Array.isArray(business?.categories)) {
    business.categories.forEach(push);
  }
  push(business?.categoryName);
  push(business?.category?.name);

  for (const id of resolveBusinessCategoryIds(business)) {
    push(categoryNameById?.get(id));
  }

  return names;
}

export function cardMatchesCategory(
  card: Pick<OfferCardItem, 'categoryId' | 'categoryIds'>,
  categoryId: string
): boolean {
  if (!categoryId) return true;
  if (Array.isArray(card.categoryIds) && card.categoryIds.length > 0) {
    return card.categoryIds.includes(categoryId);
  }
  return card.categoryId === categoryId;
}

export function isPlaceholderNavigationId(id?: string) {
  return !id || /^business-\d+$/.test(id) || /^order-\d+$/.test(id);
}

export function formatBusinessAddress(
  business?: { address?: string; city?: string } | null
): string | undefined {
  if (!business) return undefined;

  const formatted = [business.address, business.city]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ')
    .trim();

  return formatted || undefined;
}

function parseOrdersPayload(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.orders)) return obj.orders;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

export function isActiveOffer(order: any, nowMs: number = Date.now()): boolean {
  if (!order) return false;

  const status = typeof order?.status === 'string' ? order.status.toUpperCase() : '';
  if (
    order?.isActive === false ||
    status === 'INACTIVE' ||
    status === 'DRAFT' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'ARCHIVED'
  ) {
    return false;
  }

  if (!isWithinOrderPublishWindow(order, nowMs)) return false;

  const max = Number(order?.maxRedemptions);
  const claimed = Number(order?.claimedRedemptions ?? order?.claimedCount);
  if (Number.isFinite(max) && max > 0 && Number.isFinite(claimed) && claimed >= max) {
    return false;
  }

  return true;
}

export function parseOrdersFromBusinessRecord(business: any): any[] {
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

const BUSINESS_DETAIL_CONCURRENCY = 4;
const GUEST_BUSINESS_DETAIL_MAX = 8;
const MIN_ACTIVE_OFFERS_BEFORE_FANOUT = 6;

async function fetchOrdersFromBusinessDetails(
  businesses: ApiBusiness[],
  maxBusinesses = GUEST_BUSINESS_DETAIL_MAX,
  concurrency = BUSINESS_DETAIL_CONCURRENCY
): Promise<any[]> {
  const slice = businesses.slice(0, maxBusinesses);
  const merged: any[] = [];

  for (let i = 0; i < slice.length; i += concurrency) {
    const batch = slice.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (business, index) => {
        const businessId = String(business.id ?? business._id ?? `business-${i + index}`);
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
    merged.push(...results.flat());
  }

  return merged;
}

export function mapApiOrderToCardItem(order: any, index: number): OfferCardItem {
  const business = order?.business ?? {};
  const orderId = String(order?.id ?? order?._id ?? `order-${index}`);
  const businessId = resolveBusinessIdFromOrder(order);
  const categoryIds = resolveBusinessCategoryIds(business);

  const normalizedImageUri = extractOrderImageUrl(order);

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
    Adress: formatBusinessAddress(business) || 'Adress saknas',
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

function buildCatalogOfferCardsFlat(ordersRaw: any[], approvedBusinesses: ApiBusiness[]): OfferCardItem[] {
  const businessById = new Map<string, ApiBusiness>();
  approvedBusinesses.forEach((business, index) => {
    businessById.set(String(business.id ?? business._id ?? `business-${index}`), business);
  });

  const nowMs = Date.now();
  const eligible: OfferCardItem[] = [];

  ordersRaw.forEach((order, index) => {
    if (!isActiveOffer(order, nowMs)) return;

    const businessId =
      typeof order?.businessId === 'string'
        ? order.businessId
        : order?.businessId?.id ?? order?.businessId?._id;
    const catalogBusiness = businessId ? businessById.get(String(businessId)) : undefined;
    const nestedBusiness = order?.business;
    // Prefer nested order fields, but keep multi-category tags from the catalog when the
    // order payload only includes the primary categoryId.
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

function expandBusinessCardToOfferCards(card: OfferCardItem): OfferCardItem[] {
  const offers = Array.isArray(card.erbjudande)
    ? card.erbjudande
    : card.erbjudande
      ? [card.erbjudande]
      : [];
  const orderIds = card.orderIds ?? [];
  if (offers.length === 0 && orderIds.length === 0) return [];

  const count = Math.max(offers.length, orderIds.length);
  const orderImageUris = card.orderImageUris ?? [];
  return Array.from({ length: count }, (_, i) => ({
    ...card,
    deal: true,
    image: orderImageUris[i]
      ? { uri: orderImageUris[i] }
      : card.image,
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

function buildOfferCardsFromBusinessCards(cards: OfferCardItem[]): OfferCardItem[] {
  return cards.filter((card) => card.deal).flatMap(expandBusinessCardToOfferCards);
}

function applyCarouselMode(
  cards: OfferCardItem[],
  mode: 'hot' | 'endingSoon' | 'random',
  limit = 50
): OfferCardItem[] {
  const parseEndMs = (card: OfferCardItem) => {
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

  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, limit);
}

function resolveCarouselCards(
  catalogCards: OfferCardItem[],
  businessOfferCards: OfferCardItem[],
  mode: 'hot' | 'endingSoon' | 'random',
  limit = 50
): OfferCardItem[] {
  const primary = applyCarouselMode(catalogCards, mode, limit);
  if (primary.length > 0) return primary;
  return applyCarouselMode(businessOfferCards, mode, limit);
}

/** Map catalog/API businesses into home cards (no order join). */
export function cardsFromCatalogBusinesses(
  businesses: ApiBusiness[] | unknown[],
  options?: {
    cachedImageUrlById?: Map<string, string>;
    categoryNameById?: Map<string, string>;
  }
): OfferCardItem[] {
  return buildBusinessCards(businesses as ApiBusiness[], new Map(), options);
}

function buildBusinessCards(
  approvedBusinesses: ApiBusiness[],
  ordersByBusinessId: Map<string, any[]>,
  options?: {
    cachedImageUrlById?: Map<string, string>;
    categoryNameById?: Map<string, string>;
  }
): OfferCardItem[] {
  const nowMs = Date.now();

  return approvedBusinesses.map((business, index) => {
    const businessId = business.id ?? business._id ?? `business-${index}`;
    const businessOrders = ordersByBusinessId.get(String(businessId)) ?? [];
    const visibleOrders = businessOrders.filter((order) => isActiveOffer(order, nowMs));
    const firstVisibleOrder = visibleOrders[0] as any | undefined;

    const offers = visibleOrders.map((order) => order.title ?? 'Erbjudande');
    const orderIds = visibleOrders.map(
      (order, orderIndex) => order.id ?? order._id ?? `${businessId}-order-${orderIndex}`
    );
    const offerPrices = visibleOrders.map((order) => String(order.price ?? 0));
    const offerOriginalPrices = visibleOrders.map((order) =>
      order.originalPrice !== undefined ? String(order.originalPrice) : ''
    );
    const offerClaimed = visibleOrders.map((order) =>
      String(order.claimedRedemptions ?? order.claimedCount ?? 0)
    );
    const offerAmount = visibleOrders.map((order) => String(order.maxRedemptions ?? 0));
    const offerEnd = visibleOrders.map((order) => order.orderTimeTo ?? '');
    const orderImageUris = visibleOrders.map(
      (order) => extractOrderImageUrl(order) ?? ''
    );
    const firstOrderImage = orderImageUris.find((uri) => uri.length > 0);

    const cachedUrl = options?.cachedImageUrlById?.get(String(businessId));
    const normalizedImageUri =
      firstOrderImage ??
      normalizeImageUrl(
        firstVisibleOrder ? extractOrderImageUrl(firstVisibleOrder) : undefined
      ) ??
      normalizeImageUrl(
        business.imageUrl ??
          (business as any)?.image?.publicUrl ??
          (business as any)?.image?.url ??
          cachedUrl
      );

    const resolvedCategoryIds = resolveBusinessCategoryIds(business);
    const resolvedCategoryId =
      resolvedCategoryIds[0] ??
      (typeof business.categoryId === 'string' || typeof business.categoryId === 'number'
        ? String(business.categoryId)
        : undefined);

    return {
      id: String(businessId),
      title: business.name ?? 'Okänd verksamhet',
      image: {
        uri:
          normalizedImageUri ??
          `https://picsum.photos/seed/${encodeURIComponent(String(businessId))}/300/200`,
      },
      categoryId: resolvedCategoryId,
      categoryIds: resolvedCategoryIds,
      categoryName:
        business.categoryName ??
        business.category?.name ??
        (resolvedCategoryId ? options?.categoryNameById?.get(resolvedCategoryId) : undefined),
      categoryNames: resolveBusinessCategoryNames(business, options?.categoryNameById),
      subcategoryName: resolveBusinessSubcategoryName(business),
      deal: visibleOrders.length > 0,
      orderIds,
      erbjudandepris: offerPrices,
      erbjudandeoriginalpris: offerOriginalPrices,
      Adress: formatBusinessAddress(business) || 'Adress saknas',
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
      orderImageUris,
      openingHours: (business as ApiBusiness).openingHours,
    };
  });
}

export function getDiscountBadgeColor(card: OfferCardItem): string {
  return getCategoryAccentForItem(card);
}

export function computeDiscountLabel(card: OfferCardItem): string | null {
  const priceArr = Array.isArray(card.erbjudandepris) ? card.erbjudandepris : [];
  const origArr = Array.isArray(card.erbjudandeoriginalpris) ? card.erbjudandeoriginalpris : [];
  const price = Number(priceArr[0]);
  const orig = Number(origArr[0]);
  if (!Number.isFinite(price) || !Number.isFinite(orig) || orig <= 0 || price >= orig) return null;
  const pct = Math.round(((orig - price) / orig) * 100);
  if (pct <= 0) return null;
  return `-${pct}%`;
}

export function getEndingDateParts(card: OfferCardItem): { day: string; month: string } | null {
  const raw = Array.isArray(card.erbjudandelängd) ? card.erbjudandelängd[0] : card.erbjudandelängd;
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  const day = String(date.getDate());
  const month = date.toLocaleDateString('sv-SE', { month: 'short' }).toUpperCase().replace(/\./g, '');
  return { day, month };
}

function dedupeOfferCardsById(cards: OfferCardItem[]): OfferCardItem[] {
  const seen = new Set<string>();
  const out: OfferCardItem[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

/**
 * Visa alla / list fetches — targeted endpoints only.
 * Never waits on GET /home (often slow/500) or a cold nationwide catalog.
 */
export async function fetchOfferListCards(
  mode: 'hot' | 'endingSoon',
  options: {
    token?: string | null;
    coords?: { lat: number; lng: number } | null;
    city?: string | null;
    limit?: number;
  } = {}
): Promise<OfferCardItem[]> {
  const limit = options.limit ?? 50;
  const { token, city, coords } = options;
  const nowMs = Date.now();

  if (mode === 'hot') {
    const popularUrl = city
      ? `/business/popular?take=10&city=${encodeURIComponent(city)}`
      : '/business/popular?take=10';
    const popularRes = await fetch(apiUrl(popularUrl));
    const popularJson = popularRes.ok ? await popularRes.json().catch(() => ({})) : {};
    const popularBusinesses = parsePopularBusinesses(popularJson);
    if (popularBusinesses.length > 0) {
      const cachedCatalog = (peekApprovedBusinessesCatalog() as ApiBusiness[] | null) ?? [];
      const enriched = enrichPopularBusinessesFromCatalog(popularBusinesses, cachedCatalog);
      const withDistance = coords
        ? applyHaversineDistances(buildBusinessCards(enriched, new Map()), coords)
        : buildBusinessCards(enriched, new Map());
      return withDistance.slice(0, 10);
    }
  }

  if (mode === 'endingSoon' && token) {
    const take = Math.min(Math.max(limit, 1), 50);
    const res = await fetch(apiUrl(`/orders/for-you/ending-soon?take=${take}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = res.ok ? await res.json().catch(() => ({})) : {};
    const orders = parseOrdersPayload(json).filter((order) => isActiveOffer(order, nowMs));
    if (orders.length > 0) {
      const cards = dedupeOfferCardsById(
        orders.map((order, index) => mapApiOrderToCardItem(order, index))
      );
      return coords ? applyHaversineDistances(cards, coords).slice(0, limit) : cards.slice(0, limit);
    }
  }

  // Guest ending-soon / empty personalized response: single /orders call, no
  // catalog paging and no per-business detail fan-out.
  const ordersJson = await fetch(apiUrl('/orders'))
    .then((res) => res.json().catch(() => []))
    .catch(() => []);
  const ordersRaw = parseOrdersPayload(ordersJson).filter((order) =>
    isActiveOffer(order, nowMs)
  );
  if (ordersRaw.length === 0) return [];

  const catalogCardsFlat = dedupeOfferCardsById(
    ordersRaw.map((order, index) => mapApiOrderToCardItem(order, index))
  );
  const sorted = resolveCarouselCards(catalogCardsFlat, catalogCardsFlat, mode, limit);
  return coords ? applyHaversineDistances(sorted, coords) : sorted;
}

export type HomeFilterCategory = { id: string; label: string };

export type HomeScreenData = {
  categoryFilters: HomeFilterCategory[];
  deals: OfferCardItem[];
  nearYouCards: OfferCardItem[];
  hotOfferCards: OfferCardItem[];
  /** Present when loaded via city-scoped GET /home — skip nationwide event fan-out. */
  events?: EventFeedItem[];
  cityImageUris?: string[];
  resolvedCity?: string;
  /** `home` = single city bootstrap; `legacy` = old multi-endpoint path. */
  source?: 'home' | 'legacy';
};

async function readCachedBusinessImageUrls(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  try {
    const pairs = await AsyncStorage.multiGet(ids.map(businessImageCacheKey));
    const prefix = 'toodoo_business_image_url_';
    pairs.forEach(([key, value]) => {
      if (!value || !key.startsWith(prefix)) return;
      map.set(key.slice(prefix.length), value);
    });
  } catch {
    // ignore cache read errors
  }

  return map;
}

function sortHomeDeals(
  cards: OfferCardItem[],
  coords?: { lat: number; lng: number } | null
): OfferCardItem[] {
  const withDistance =
    coords != null
      ? applyHaversineDistances(cards, coords)
      : cards;

  return [...withDistance].sort((a, b) => {
    const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return Number(b.deal) - Number(a.deal);
  });
}

/** Parses the { businesses: [...] } payload from GET /business/popular. */
function parsePopularBusinesses(json: unknown): ApiBusiness[] {
  const obj = json as Record<string, unknown>;
  const list = Array.isArray(obj?.businesses)
    ? (obj.businesses as any[])
    : Array.isArray(json)
      ? (json as any[])
      : [];

  const businesses: ApiBusiness[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? raw._id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    businesses.push({
      id,
      name: raw.name,
      description: raw.description,
      contactPhone: raw.contactPhone,
      website: raw.website,
      address: raw.address,
      city: raw.city,
      status: raw.status,
      latitude: raw.latitude,
      longitude: raw.longitude,
      categoryId: raw.categoryId ?? raw.category?.id,
      categoryName: raw.categoryName ?? raw.category?.name,
      categories: Array.isArray(raw.categories) ? raw.categories : undefined,
      categoryIds: Array.isArray(raw.categoryIds) ? raw.categoryIds.map(String) : undefined,
      imageUrl:
        raw.imageUrl ??
        raw.image?.publicUrl ??
        raw.image?.url ??
        undefined,
      openingHours: raw.openingHours,
      ...(raw.subcategoryName || raw.subcategory
        ? {
            subcategoryName: raw.subcategoryName,
            subcategory: raw.subcategory,
          }
        : {}),
    } as ApiBusiness);
  }
  return businesses;
}

/**
 * Popular ranking payloads are often slim (no nested categories / hours).
 * Overlay full catalog records while preserving popular order.
 */
function enrichPopularBusinessesFromCatalog(
  popular: ApiBusiness[],
  catalog: ApiBusiness[]
): ApiBusiness[] {
  if (popular.length === 0) return popular;
  const byId = new Map<string, ApiBusiness>();
  for (const business of catalog) {
    const id = String(business?.id ?? business?._id ?? '').trim();
    if (id) byId.set(id, business);
  }
  return popular.map((row) => {
    const id = String(row?.id ?? row?._id ?? '').trim();
    const full = id ? byId.get(id) : undefined;
    if (!full) return row;
    return {
      ...full,
      ...row,
      // Prefer catalog fields that the popular endpoint often omits.
      categories: Array.isArray(row.categories) && row.categories.length > 0
        ? row.categories
        : full.categories,
      categoryIds:
        Array.isArray(row.categoryIds) && row.categoryIds.length > 0
          ? row.categoryIds
          : full.categoryIds,
      categoryId: row.categoryId ?? full.categoryId,
      categoryName: row.categoryName ?? full.categoryName,
      category: row.category ?? full.category,
      openingHours: row.openingHours ?? full.openingHours,
      imageUrl: row.imageUrl ?? full.imageUrl,
      latitude: row.latitude ?? full.latitude,
      longitude: row.longitude ?? full.longitude,
      description: row.description ?? full.description,
      contactPhone: row.contactPhone ?? full.contactPhone,
      website: row.website ?? full.website,
      address: row.address ?? full.address,
      city: row.city ?? full.city,
    };
  });
}

function mapHomeBusinessEventToFeed(raw: any): EventFeedItem | null {
  const id = String(raw?.id ?? raw?._id ?? '').trim();
  if (!id) return null;
  const business = raw?.business ?? {};
  const businessId = String(business?.id ?? business?._id ?? raw?.businessId ?? '').trim();
  const imageUri = normalizeImageUrl(
    raw?.image?.publicUrl ?? raw?.image?.url ?? raw?.imageUrl ?? business?.image?.publicUrl
  );
  const latitude = Number(business?.latitude);
  const longitude = Number(business?.longitude);
  const startsAt = String(raw?.startsAt ?? '');
  const endsAt = String(raw?.endsAt ?? '');
  return {
    id: `business:${id}`,
    source: 'business',
    title: String(raw?.title ?? 'Evenemang'),
    subtitle: String(business?.name ?? 'Evenemang'),
    startsAt,
    endsAt,
    ...(imageUri ? { image: { uri: imageUri } } : {}),
    ...(Number.isFinite(latitude) ? { latitude } : {}),
    ...(Number.isFinite(longitude) ? { longitude } : {}),
    ...(businessId ? { businessId } : {}),
    categoryName:
      typeof business?.category?.name === 'string'
        ? business.category.name
        : typeof business?.categoryName === 'string'
          ? business.categoryName
          : undefined,
    businessEvent: {
      id,
      title: String(raw?.title ?? 'Evenemang'),
      description: String(raw?.description ?? ''),
      startsAt,
      endsAt,
      visibleFrom: String(raw?.visibleFrom ?? ''),
      visibleTo: String(raw?.visibleTo ?? ''),
      locationName: raw?.locationName ?? undefined,
      businessId: businessId || id,
      businessName: String(business?.name ?? 'Okänd verksamhet'),
      businessCity: business?.city ?? undefined,
      ...(imageUri ? { image: { uri: imageUri } } : {}),
    },
  };
}

function mapHomePayloadToScreenData(
  json: any,
  coords?: { lat: number; lng: number } | null,
  options?: { endingSoonLimit?: number }
): HomeScreenData {
  const nowMs = Date.now();
  const endingSoonLimit = options?.endingSoonLimit ?? 50;
  const resolvedCity =
    typeof json?.location?.city === 'string' && json.location.city.trim()
      ? String(json.location.city).trim()
      : typeof json?.location?.cityKey === 'string'
        ? String(json.location.cityKey).trim()
        : undefined;

  const categoriesRaw = Array.isArray(json?.categories) ? json.categories : [];
  const categoryNameById = new Map<string, string>();
  const categoryFilters: HomeFilterCategory[] = categoriesRaw
    .map((category: any, index: number) => {
      const id = String(category?.id ?? category?._id ?? `category-${index}`);
      const name = typeof category?.name === 'string' ? category.name.trim() : '';
      if (id && name) categoryNameById.set(id, name);
      return name ? { id, label: name } : null;
    })
    .filter((item: HomeFilterCategory | null): item is HomeFilterCategory => Boolean(item));

  const businessItems = Array.isArray(json?.businesses?.items)
    ? (json.businesses.items as ApiBusiness[])
    : Array.isArray(json?.businesses)
      ? (json.businesses as ApiBusiness[])
      : [];
  const approvedBusinesses = businessItems.filter(
    (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
  );

  const ordersRaw = parseOrdersPayload(json?.orders);
  const ordersFromBusinessList = approvedBusinesses.flatMap(parseOrdersFromBusinessRecord);
  const allOrdersRaw = mergeOrdersById(ordersRaw, ordersFromBusinessList);

  const ordersByBusinessId = new Map<string, any[]>();
  allOrdersRaw.forEach((order) => {
    const businessId =
      typeof order.businessId === 'string'
        ? order.businessId
        : order.businessId?.id ?? order.businessId?._id;
    if (!businessId) return;
    const key = String(businessId);
    if (!ordersByBusinessId.has(key)) ordersByBusinessId.set(key, []);
    ordersByBusinessId.get(key)?.push(order);
  });

  const cards = buildBusinessCards(approvedBusinesses, ordersByBusinessId, {
    categoryNameById,
  });
  const deals = sortHomeDeals(cards, coords);

  const catalogCardsFlat = buildCatalogOfferCardsFlat(
    allOrdersRaw.filter((order) => isActiveOffer(order, nowMs)),
    approvedBusinesses
  );
  const businessOfferCards = buildOfferCardsFromBusinessCards(cards);
  const nearYouCards = resolveCarouselCards(
    catalogCardsFlat,
    businessOfferCards,
    'endingSoon',
    endingSoonLimit
  );

  const popularBusinesses = parsePopularBusinesses(json?.popular ?? {});
  let hotOfferCards: OfferCardItem[] = [];
  if (popularBusinesses.length > 0) {
    const enrichedPopular = enrichPopularBusinessesFromCatalog(
      popularBusinesses,
      approvedBusinesses
    );
    hotOfferCards = buildBusinessCards(enrichedPopular, ordersByBusinessId, {
      categoryNameById,
    }).slice(0, 10);
  }
  if (hotOfferCards.length === 0) {
    hotOfferCards = deals.slice(0, 10);
  }

  const publicEvents = Array.isArray(json?.events?.public) ? json.events.public : [];
  const businessEvents = Array.isArray(json?.events?.business) ? json.events.business : [];
  const events: EventFeedItem[] = [
    ...publicEvents
      .map((raw: any) => {
        const mapped = mapApiMunicipioEvent(raw);
        if (!mapped) return null;
        return {
          id: `municipio:${mapped.id}`,
          source: 'municipio' as const,
          title: mapped.title,
          subtitle: mapped.locationLabel ?? 'Evenemang',
          startsAt: mapped.startsAt,
          endsAt: mapped.endsAt,
          image: mapped.image,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
          categoryId: mapped.categoryId,
          categoryName: mapped.categoryName,
          municipioEvent: mapped,
        } satisfies EventFeedItem;
      })
      .filter((item: EventFeedItem | null): item is EventFeedItem => Boolean(item)),
    ...businessEvents
      .map(mapHomeBusinessEventToFeed)
      .filter((item: EventFeedItem | null): item is EventFeedItem => Boolean(item)),
  ];

  const cityImageRows = Array.isArray(json?.cityImages)
    ? (json.cityImages as CityImage[])
    : [];
  const cityImageUris = cityImageUrisFromRows(cityImageRows, 3);
  if (resolvedCity && cityImageUris.length > 0) {
    primeCityImageUris(resolvedCity, cityImageUris);
  }

  return {
    categoryFilters,
    deals,
    nearYouCards,
    hotOfferCards,
    events,
    cityImageUris,
    resolvedCity,
    source: 'home',
  };
}

export type FetchCityHomeOptions = {
  token?: string | null;
  coords?: { lat: number; lng: number } | null;
  city?: string | null;
  /** City business page size (Visa alla / Nära dig). Default 50, max 100. */
  take?: number;
  popularTake?: number;
  ordersTake?: number;
  eventsTake?: number;
  recommendedTake?: number;
  endingSoonLimit?: number;
};

/**
 * City-scoped bootstrap via GET /home. Returns null when the endpoint is
 * unavailable so callers can fall back to the legacy fan-out.
 */
export async function fetchHomeViaCityEndpoint(
  options: FetchCityHomeOptions
): Promise<HomeScreenData | null> {
  const city = options.city?.trim() || '';
  const params = new URLSearchParams();
  if (city) {
    params.set('city', city);
  } else if (
    options.coords &&
    Number.isFinite(options.coords.lat) &&
    Number.isFinite(options.coords.lng)
  ) {
    params.set('lat', String(options.coords.lat));
    params.set('lng', String(options.coords.lng));
  } else {
    return null;
  }

  const clamp = (value: number | undefined, fallback: number, max: number) =>
    Math.min(Math.max(value ?? fallback, 1), max);

  params.set('take', String(clamp(options.take, 50, 100)));
  params.set('popularTake', String(clamp(options.popularTake, 10, 50)));
  params.set('ordersTake', String(clamp(options.ordersTake, 50, 100)));
  params.set('eventsTake', String(clamp(options.eventsTake, 40, 100)));
  params.set('recommendedTake', String(clamp(options.recommendedTake, 8, 20)));

  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(apiUrl(`/home?${params.toString()}`), {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object' || (json as any).error) return null;
    return mapHomePayloadToScreenData(json, options.coords, {
      endingSoonLimit: options.endingSoonLimit ?? clamp(options.ordersTake, 50, 100),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Optimized home bootstrap — prefers city-scoped GET /home, else legacy fan-out. */
export async function fetchHomeScreenData(options: {
  token?: string | null;
  coords?: { lat: number; lng: number } | null;
  city?: string | null;
}): Promise<HomeScreenData> {
  const { token, coords, city } = options;

  const viaHome = await fetchHomeViaCityEndpoint({ token, coords, city });
  if (viaHome) return viaHome;

  const nowMs = Date.now();

  // Fire every network request up front — the orders/popular/close calls do not
  // depend on the catalogs, so overlapping them removes a full round-trip batch
  // from location switches (the catalog refetch is the slowest call when stale).
  const popularUrl = '/business/popular?take=10';
  const closeUrl = coords
    ? `/orders/for-you/close?take=10&lat=${coords.lat}&lng=${coords.lng}`
    : '/orders/for-you/close?take=10';
  const ordersPromise = fetch(apiUrl('/orders'))
    .then((res) => res.json().catch(() => []))
    .catch(() => []);
  const popularPromise = fetch(apiUrl(popularUrl)).catch(() => null);
  const closePromise = token
    ? fetch(apiUrl(closeUrl), {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
    : null;

  const [categoriesRaw, businessesRaw] = await Promise.all([
    fetchCategoriesCatalog(),
    fetchApprovedBusinessesCatalog(),
  ]);

  const approvedBusinessesEarly = (businessesRaw as ApiBusiness[]).filter(
    (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
  );

  const categoryNameById = new Map<string, string>();
  (categoriesRaw as any[]).forEach((category) => {
    const id = category?.id ?? category?._id;
    if (id && category?.name) {
      categoryNameById.set(String(id), String(category.name));
    }
  });

  const categoryFilters: HomeFilterCategory[] = (categoriesRaw as any[])
    .map((category, index) => {
      const id = String(category?.id ?? category?._id ?? `category-${index}`);
      const name = typeof category?.name === 'string' ? category.name.trim() : '';
      return name ? { id, label: name } : null;
    })
    .filter((item): item is HomeFilterCategory => Boolean(item));

  const ordersFromBusinessList = approvedBusinessesEarly.flatMap(parseOrdersFromBusinessRecord);
  let allOrdersRaw: any[] = [...ordersFromBusinessList];
  let nearYouFromApi: OfferCardItem[] = [];
  let hotFromApi: OfferCardItem[] = [];
  let popularBusinesses: ApiBusiness[] = [];

  const [ordersJson, closeRes, popularRes] = await Promise.all([
    ordersPromise,
    closePromise,
    popularPromise,
  ]);

  allOrdersRaw = mergeOrdersById(parseOrdersPayload(ordersJson), ordersFromBusinessList);

  const popularJson =
    popularRes && popularRes.ok ? await popularRes.json().catch(() => ({})) : {};
  popularBusinesses = parsePopularBusinesses(popularJson);

  if (token) {
    const closeJson =
      closeRes && closeRes.ok ? await closeRes.json().catch(() => ({})) : {};
    nearYouFromApi = buildCatalogOfferCardsFlat(
      parseOrdersPayload(closeJson).filter((order) => isActiveOffer(order, nowMs)),
      approvedBusinessesEarly
    );
  }

  const activeCount = allOrdersRaw.filter((order) => isActiveOffer(order, nowMs)).length;
  if (activeCount < MIN_ACTIVE_OFFERS_BEFORE_FANOUT) {
    allOrdersRaw = mergeOrdersById(
      allOrdersRaw,
      await fetchOrdersFromBusinessDetails(approvedBusinessesEarly)
    );
  }

  const ordersByBusinessId = new Map<string, any[]>();
  allOrdersRaw.forEach((order) => {
    const businessId =
      typeof order.businessId === 'string'
        ? order.businessId
        : order.businessId?.id ?? order.businessId?._id;
    if (!businessId) return;
    const key = String(businessId);
    if (!ordersByBusinessId.has(key)) {
      ordersByBusinessId.set(key, []);
    }
    ordersByBusinessId.get(key)?.push(order);
  });

  const needsImageCacheIds = approvedBusinessesEarly
    .map((business, index) => {
      const id = String(business.id ?? business._id ?? `business-${index}`);
      const hasImage =
        (typeof business.imageUrl === 'string' && business.imageUrl.trim()) ||
        (typeof (business as any)?.image?.publicUrl === 'string' &&
          (business as any).image.publicUrl.trim());
      return hasImage ? null : id;
    })
    .filter((id): id is string => Boolean(id))
    .slice(0, 24);

  const cachedImageUrlById = await readCachedBusinessImageUrls(needsImageCacheIds);

  const cards = buildBusinessCards(approvedBusinessesEarly, ordersByBusinessId, {
    cachedImageUrlById,
    categoryNameById,
  });

  const deals = sortHomeDeals(cards, coords);
  const businessOfferCards = buildOfferCardsFromBusinessCards(cards);
  const catalogCardsFlat = buildCatalogOfferCardsFlat(allOrdersRaw, approvedBusinessesEarly);

  if (token) {
    if (nearYouFromApi.length === 0) {
      nearYouFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'endingSoon');
    }
  } else {
    nearYouFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'endingSoon');
  }

  if (popularBusinesses.length > 0) {
    // Build cards from popular rank order, enriched with full catalog fields
    // (subcategory + opening hours are often missing from /business/popular).
    const enrichedPopular = enrichPopularBusinessesFromCatalog(
      popularBusinesses,
      approvedBusinessesEarly
    );
    hotFromApi = buildBusinessCards(enrichedPopular, ordersByBusinessId, {
      cachedImageUrlById,
      categoryNameById,
    }).slice(0, 10);
  }

  // Guests / missing popular response: keep a stable catalog slice (not random).
  if (hotFromApi.length === 0) {
    hotFromApi = deals.slice(0, 10);
  }

  return {
    categoryFilters,
    deals,
    nearYouCards: nearYouFromApi,
    hotOfferCards: hotFromApi,
    source: 'legacy',
  };
}
