import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl, normalizeImageUrl } from '@/lib/api';
import type { OfferCardItem } from '@/lib/home-offers';

const BUSINESS_IMAGE_CACHE_PREFIX = 'toodoo_business_image_url_';
const HYDRATE_CONCURRENCY = 5;

export function businessImageCacheKey(businessId: string) {
  return `${BUSINESS_IMAGE_CACHE_PREFIX}${businessId}`;
}

export function isLikelyPicsumUrl(uri: string) {
  return uri.includes('picsum.photos/');
}

export function readCardImageUri(card: Pick<OfferCardItem, 'image'>): string | undefined {
  const uri =
    typeof card.image === 'object' &&
    card.image &&
    'uri' in card.image &&
    typeof card.image.uri === 'string'
      ? card.image.uri.trim()
      : '';
  return uri || undefined;
}

export function extractBusinessImageUrl(payload: any): string | undefined {
  const raw =
    payload?.imageUrl ??
    payload?.image?.publicUrl ??
    payload?.image?.url ??
    payload?.business?.imageUrl ??
    payload?.business?.image?.publicUrl ??
    payload?.business?.image?.url ??
    (Array.isArray(payload?.images) ? payload.images[0] : undefined);

  return normalizeImageUrl(raw);
}

export function extractOrderImageUrl(order: any): string | undefined {
  const raw =
    order?.image?.publicUrl ??
    order?.image?.url ??
    order?.imageUrl ??
    order?.imageAsset?.publicUrl ??
    order?.imageAsset?.url ??
    order?.coverImage?.publicUrl ??
    order?.coverImage?.url ??
    order?.thumbnail?.publicUrl ??
    order?.thumbnail?.url;

  return normalizeImageUrl(raw);
}

export async function fetchOrderImageUrl(orderId: string): Promise<string | undefined> {
  try {
    const res = await fetch(apiUrl(`/orders/${encodeURIComponent(orderId)}`));
    const json = await res.json().catch(() => ({}));
    const order = (json as any)?.order ?? json;
    return extractOrderImageUrl(order);
  } catch {
    return undefined;
  }
}

export async function fetchBusinessImageUrl(businessId: string): Promise<string | undefined> {
  try {
    const res = await fetch(apiUrl(`/business/${encodeURIComponent(businessId)}`));
    const json = await res.json().catch(() => ({}));
    const business = (json as any)?.business ?? json;
    return extractBusinessImageUrl(business) ?? extractBusinessImageUrl(json);
  } catch {
    return undefined;
  }
}

async function readCachedBusinessImageUrls(businessIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (businessIds.length === 0) {
    return map;
  }

  try {
    const pairs = await AsyncStorage.multiGet(businessIds.map(businessImageCacheKey));
    pairs.forEach(([key, value]) => {
      if (!value) return;
      const id = key.slice(BUSINESS_IMAGE_CACHE_PREFIX.length);
      if (id) {
        map.set(id, value);
      }
    });
  } catch {
    // ignore cache read errors
  }

  return map;
}

/** Replace placeholder/missing card images with order or business images from the API. */
export async function hydrateOfferCardImages(
  cards: OfferCardItem[],
  options: { knownCards?: OfferCardItem[] } = {}
): Promise<OfferCardItem[]> {
  const resolvedByBusinessId = new Map<string, string>();
  const resolvedByOrderId = new Map<string, string>();

  for (const card of options.knownCards ?? []) {
    const uri = readCardImageUri(card);
    if (uri && !isLikelyPicsumUrl(uri)) {
      resolvedByBusinessId.set(card.id, uri);
      const orderId = card.orderIds?.[0];
      if (orderId) {
        resolvedByOrderId.set(String(orderId), uri);
      }
    }
  }

  const needsBusinessHydration = new Set<string>();
  const needsOrderHydration = new Set<string>();

  for (const card of cards) {
    const orderId = card.orderIds?.[0] ? String(card.orderIds[0]) : undefined;
    if (orderId) {
      if (!resolvedByOrderId.has(orderId)) {
        needsOrderHydration.add(orderId);
      }
      continue;
    }

    const uri = readCardImageUri(card);
    if (uri && !isLikelyPicsumUrl(uri)) continue;
    if (!resolvedByBusinessId.has(card.id)) {
      needsBusinessHydration.add(card.id);
    }
  }

  const cached = await readCachedBusinessImageUrls([...needsBusinessHydration]);
  cached.forEach((uri, id) => {
    if (!resolvedByBusinessId.has(id)) {
      resolvedByBusinessId.set(id, uri);
    }
  });

  const stillMissingBusiness = [...needsBusinessHydration].filter((id) => !resolvedByBusinessId.has(id));
  for (let i = 0; i < stillMissingBusiness.length; i += HYDRATE_CONCURRENCY) {
    const batch = stillMissingBusiness.slice(i, i + HYDRATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const uri = await fetchBusinessImageUrl(id);
        return uri ? ([id, uri] as const) : null;
      })
    );

    for (const entry of results) {
      if (entry) {
        resolvedByBusinessId.set(entry[0], entry[1]);
      }
    }
  }

  const stillMissingOrders = [...needsOrderHydration].filter((id) => !resolvedByOrderId.has(id));
  for (let i = 0; i < stillMissingOrders.length; i += HYDRATE_CONCURRENCY) {
    const batch = stillMissingOrders.slice(i, i + HYDRATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const uri = await fetchOrderImageUrl(id);
        return uri ? ([id, uri] as const) : null;
      })
    );

    for (const entry of results) {
      if (entry) {
        resolvedByOrderId.set(entry[0], entry[1]);
      }
    }
  }

  try {
    const toCache: [string, string][] = stillMissingBusiness
      .map((id) => {
        const uri = resolvedByBusinessId.get(id);
        return uri ? ([businessImageCacheKey(id), uri] as [string, string]) : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry));

    if (toCache.length > 0) {
      await AsyncStorage.multiSet(toCache);
    }
  } catch {
    // ignore cache write errors
  }

  return cards.map((card) => {
    const orderId = card.orderIds?.[0] ? String(card.orderIds[0]) : undefined;
    const orderUri = orderId ? resolvedByOrderId.get(orderId) : undefined;
    if (orderUri) {
      const current = readCardImageUri(card);
      if (current === orderUri) {
        return card;
      }
      return { ...card, image: { uri: orderUri } };
    }

    const current = readCardImageUri(card);
    if (current && !isLikelyPicsumUrl(current)) {
      return card;
    }

    const businessUri = resolvedByBusinessId.get(card.id);
    if (!businessUri) {
      return card;
    }

    return { ...card, image: { uri: businessUri } };
  });
}
