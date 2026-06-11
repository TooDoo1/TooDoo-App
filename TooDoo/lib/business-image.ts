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

/** Replace placeholder/missing card images with known, cached, or fetched business images. */
export async function hydrateOfferCardImages(
  cards: OfferCardItem[],
  options: { knownCards?: OfferCardItem[] } = {}
): Promise<OfferCardItem[]> {
  const resolved = new Map<string, string>();

  for (const card of options.knownCards ?? []) {
    const uri = readCardImageUri(card);
    if (uri && !isLikelyPicsumUrl(uri)) {
      resolved.set(card.id, uri);
    }
  }

  const needsHydration = new Set<string>();
  for (const card of cards) {
    const uri = readCardImageUri(card);
    if (!uri || isLikelyPicsumUrl(uri)) {
      needsHydration.add(card.id);
    }
  }

  const cached = await readCachedBusinessImageUrls([...needsHydration]);
  cached.forEach((uri, id) => {
    if (!resolved.has(id)) {
      resolved.set(id, uri);
    }
  });

  const stillMissing = [...needsHydration].filter((id) => !resolved.has(id));
  for (let i = 0; i < stillMissing.length; i += HYDRATE_CONCURRENCY) {
    const batch = stillMissing.slice(i, i + HYDRATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const uri = await fetchBusinessImageUrl(id);
        return uri ? ([id, uri] as const) : null;
      })
    );

    for (const entry of results) {
      if (entry) {
        resolved.set(entry[0], entry[1]);
      }
    }
  }

  try {
    const toCache: [string, string][] = stillMissing
      .map((id) => {
        const uri = resolved.get(id);
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
    const nextUri = resolved.get(card.id);
    if (!nextUri) {
      return card;
    }

    const current = readCardImageUri(card);
    if (current && !isLikelyPicsumUrl(current)) {
      return card;
    }

    return { ...card, image: { uri: nextUri } };
  });
}
