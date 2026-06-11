import type { ImageSourcePropType } from 'react-native';

import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { getCategoryAccentForItem } from '@/lib/category-colors';
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

export function mapApiOrderToCardItem(order: any, index: number): OfferCardItem {
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
  ordersByBusinessId: Map<string, any[]>
): OfferCardItem[] {
  const nowMs = Date.now();

  return approvedBusinesses.map((business, index) => {
    const businessId = business.id ?? business._id ?? `business-${index}`;
    const businessOrders = ordersByBusinessId.get(String(businessId)) ?? [];
    const visibleOrders = businessOrders.filter((order) => isActiveOffer(order, nowMs));

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

    const normalizedImageUri = normalizeImageUrl(business.imageUrl);

    return {
      id: String(businessId),
      title: business.name ?? 'Okänd verksamhet',
      image: {
        uri:
          normalizedImageUri ??
          `https://picsum.photos/seed/${encodeURIComponent(String(businessId))}/300/200`,
      },
      categoryId: business.categoryId,
      categoryName: business.categoryName,
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
    const [res, businessRes] = await Promise.all([
      fetch(apiUrl(endpoint), { headers: authHeaders }),
      fetch(apiUrl('/business?status=APPROVED')),
    ]);
    const json = res.ok ? await res.json().catch(() => ({})) : {};
    const businessJson = await businessRes.json().catch(() => []);
    const approvedBusinesses: ApiBusiness[] = (
      Array.isArray(businessJson)
        ? businessJson
        : Array.isArray(businessJson?.businesses)
          ? businessJson.businesses
          : Array.isArray(businessJson?.data)
            ? businessJson.data
            : []
    ).filter((business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED');
    const fromApi = buildCatalogOfferCardsFlat(
      parseOrdersPayload(json).filter((order) => isActiveOffer(order, nowMs)),
      approvedBusinesses
    );
    if (fromApi.length > 0) {
      return fromApi.slice(0, limit);
    }
  }

  const [businessRes, ordersRes] = await Promise.all([
    fetch(apiUrl('/business?status=APPROVED')),
    fetch(apiUrl('/orders')),
  ]);

  const businessJson = await businessRes.json().catch(() => []);
  const ordersJson = await ordersRes.json().catch(() => []);

  const businessesRaw: ApiBusiness[] = Array.isArray(businessJson)
    ? businessJson
    : Array.isArray(businessJson?.businesses)
      ? businessJson.businesses
      : Array.isArray(businessJson?.data)
        ? businessJson.data
        : [];

  const ordersRaw: any[] = Array.isArray(ordersJson)
    ? ordersJson
    : Array.isArray(ordersJson?.orders)
      ? ordersJson.orders
      : Array.isArray(ordersJson?.data)
        ? ordersJson.data
        : [];

  const approvedBusinesses = businessesRaw.filter(
    (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
  );

  const ordersFromBusinessList = businessesRaw.flatMap(parseOrdersFromBusinessRecord);
  let allOrdersRaw = mergeOrdersById(ordersRaw, ordersFromBusinessList);
  if (!token) {
    const fromBusinessDetails = await fetchOrdersFromBusinessDetails(approvedBusinesses, 12);
    allOrdersRaw = mergeOrdersById(allOrdersRaw, fromBusinessDetails);
  } else if (allOrdersRaw.length === 0) {
    allOrdersRaw = await fetchOrdersFromBusinessDetails(approvedBusinesses.slice(0, 12));
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
