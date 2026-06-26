import type { ImageSourcePropType } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { businessImageCacheKey, extractOrderImageUrl } from '@/lib/business-image';
import { fetchApprovedBusinessesCatalog, fetchCategoriesCatalog } from '@/lib/catalog-cache';
import { getCategoryAccentForItem } from '@/lib/category-colors';
import { haversineKm } from '@/lib/geo';
import { isWithinOrderPublishWindow } from '@/lib/order-claim-window';

export type OfferCardItem = {
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
  /** Per-offer image URIs used when expanding one business card into many offers. */
  orderImageUris?: string[];
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
  status?: string;
  latitude?: number;
  longitude?: number;
};

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

  const normalizedImageUri = extractOrderImageUrl(order);

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
    const business =
      order?.business ?? (businessId ? businessById.get(String(businessId)) : undefined);

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

    const resolvedCategoryId =
      typeof business.categoryId === 'string' || typeof business.categoryId === 'number'
        ? String(business.categoryId)
        : undefined;

    return {
      id: String(businessId),
      title: business.name ?? 'Okänd verksamhet',
      image: {
        uri:
          normalizedImageUri ??
          `https://picsum.photos/seed/${encodeURIComponent(String(businessId))}/300/200`,
      },
      categoryId: resolvedCategoryId,
      categoryName:
        business.categoryName ??
        (resolvedCategoryId ? options?.categoryNameById?.get(resolvedCategoryId) : undefined),
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

export async function fetchOfferListCards(
  mode: 'hot' | 'endingSoon',
  options: {
    token?: string | null;
    coords?: { lat: number; lng: number } | null;
    limit?: number;
  } = {}
): Promise<OfferCardItem[]> {
  const limit = options.limit ?? 50;
  const { token, coords } = options;
  const nowMs = Date.now();

  if (token) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const endpoint =
      mode === 'hot'
        ? `/orders/for-you/hot?take=${limit}`
        : coords
          ? `/orders/for-you/close?take=${limit}&lat=${coords.lat}&lng=${coords.lng}`
          : `/orders/for-you/close?take=${limit}`;
    const [res, approvedBusinesses] = await Promise.all([
      fetch(apiUrl(endpoint), { headers: authHeaders }),
      fetchApprovedBusinessesCatalog().then((raw) =>
        (raw as ApiBusiness[]).filter(
          (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
        )
      ),
    ]);
    const json = res.ok ? await res.json().catch(() => ({})) : {};
    const fromApi = buildCatalogOfferCardsFlat(
      parseOrdersPayload(json).filter((order) => isActiveOffer(order, nowMs)),
      approvedBusinesses
    );
    if (fromApi.length > 0) {
      return fromApi.slice(0, limit);
    }
  }

  const [approvedBusinesses, ordersJson] = await Promise.all([
    fetchApprovedBusinessesCatalog().then((raw) =>
      (raw as ApiBusiness[]).filter(
        (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
      )
    ),
    fetch(apiUrl('/orders')).then((res) => res.json().catch(() => [])),
  ]);

  const ordersRaw: any[] = parseOrdersPayload(ordersJson);

  const ordersFromBusinessList = (approvedBusinesses as ApiBusiness[]).flatMap(
    parseOrdersFromBusinessRecord
  );
  let allOrdersRaw = mergeOrdersById(ordersRaw, ordersFromBusinessList);
  const activeCount = allOrdersRaw.filter((order) => isActiveOffer(order, nowMs)).length;
  if (!token && activeCount < MIN_ACTIVE_OFFERS_BEFORE_FANOUT) {
    const fromBusinessDetails = await fetchOrdersFromBusinessDetails(approvedBusinesses as ApiBusiness[]);
    allOrdersRaw = mergeOrdersById(allOrdersRaw, fromBusinessDetails);
  } else if (token && allOrdersRaw.length === 0) {
    const fromBusinessDetails = await fetchOrdersFromBusinessDetails(
      (approvedBusinesses as ApiBusiness[]).slice(0, GUEST_BUSINESS_DETAIL_MAX)
    );
    allOrdersRaw = mergeOrdersById(allOrdersRaw, fromBusinessDetails);
  }

  const ordersByBusinessId = new Map<string, any[]>();
  allOrdersRaw.forEach((order) => {
    const businessId =
      typeof order.businessId === 'string'
        ? order.businessId
        : order.businessId?.id ?? order.businessId?._id;
    if (!businessId) return;
    if (!ordersByBusinessId.has(businessId)) {
      ordersByBusinessId.set(businessId, []);
    }
    ordersByBusinessId.get(businessId)?.push(order);
  });

  const businessCards = buildBusinessCards(approvedBusinesses, ordersByBusinessId);
  const businessOfferCards = buildOfferCardsFromBusinessCards(businessCards);
  const catalogCardsFlat = buildCatalogOfferCardsFlat(allOrdersRaw, approvedBusinesses);
  const carouselMode = mode === 'hot' && !token ? 'random' : mode;

  return resolveCarouselCards(catalogCardsFlat, businessOfferCards, carouselMode, limit);
}

export type HomeFilterCategory = { id: string; label: string };

export type HomeScreenData = {
  categoryFilters: HomeFilterCategory[];
  deals: OfferCardItem[];
  nearYouCards: OfferCardItem[];
  hotOfferCards: OfferCardItem[];
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
  const withDistance = cards.map((card) => {
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

  if (coords) {
    return [...withDistance].sort((a, b) => {
      const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
      const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return Number(b.deal) - Number(a.deal);
    });
  }

  return [...withDistance].sort((a, b) => Number(b.deal) - Number(a.deal));
}

/** Optimized home bootstrap — shared catalog cache, batched fan-out, parallel for-you APIs. */
export async function fetchHomeScreenData(options: {
  token?: string | null;
  coords?: { lat: number; lng: number } | null;
}): Promise<HomeScreenData> {
  const { token, coords } = options;
  const nowMs = Date.now();

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

  if (token) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const closeUrl = coords
      ? `/orders/for-you/close?take=10&lat=${coords.lat}&lng=${coords.lng}`
      : '/orders/for-you/close?take=10';

    const [ordersJson, closeRes, hotRes] = await Promise.all([
      fetch(apiUrl('/orders')).then((res) => res.json().catch(() => [])),
      fetch(apiUrl(closeUrl), { headers: authHeaders }),
      fetch(apiUrl('/orders/for-you/hot?take=10'), { headers: authHeaders }),
    ]);

    allOrdersRaw = mergeOrdersById(parseOrdersPayload(ordersJson), ordersFromBusinessList);

    const closeJson = closeRes.ok ? await closeRes.json().catch(() => ({})) : {};
    const hotJson = hotRes.ok ? await hotRes.json().catch(() => ({})) : {};
    nearYouFromApi = buildCatalogOfferCardsFlat(
      parseOrdersPayload(closeJson).filter((order) => isActiveOffer(order, nowMs)),
      approvedBusinessesEarly
    );
    hotFromApi = buildCatalogOfferCardsFlat(
      parseOrdersPayload(hotJson).filter((order) => isActiveOffer(order, nowMs)),
      approvedBusinessesEarly
    );
  } else {
    const ordersJson = await fetch(apiUrl('/orders')).then((res) => res.json().catch(() => []));
    allOrdersRaw = mergeOrdersById(parseOrdersPayload(ordersJson), ordersFromBusinessList);
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
    if (hotFromApi.length === 0) {
      hotFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'hot');
    }
  } else {
    nearYouFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'endingSoon');
    hotFromApi = resolveCarouselCards(catalogCardsFlat, businessOfferCards, 'random');
  }

  return {
    categoryFilters,
    deals,
    nearYouCards: nearYouFromApi,
    hotOfferCards: hotFromApi,
  };
}
