import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { fetchApprovedBusinessesCatalog } from '@/lib/catalog-cache';
import { fetchBusinessEvents } from '@/lib/business-events';
import { haversineKm, type Coords } from '@/lib/geo';
import {
  getHomeNearbyBusinessesCache,
  peekHomeNearbyBusinessesCache,
  setHomeNearbyBusinessesCache,
  type NearbyBusinessCard,
} from '@/lib/home-list-cache';
import {
  getOrderBusinessId,
  isActiveOffer,
  parseOrdersList,
} from '@/lib/offers';

export type MapBusiness = {
  id: string;
  name: string;
  imageUri?: string;
  address: string;
  description?: string;
  latitude: number;
  longitude: number;
  distanceKm?: number;
  categoryName?: string;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

function parseBusinesses(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function pickImageUri(business: any): string | undefined {
  const raw =
    business?.image?.publicUrl ??
    business?.image?.url ??
    business?.imageUrl ??
    business?.logoUrl ??
    business?.logo?.url ??
    (Array.isArray(business?.images) ? business.images[0] : undefined);
  return normalizeImageUrl(raw) ?? undefined;
}

export function cardToMapBusiness(card: NearbyBusinessCard): MapBusiness | null {
  const latitude = card.latitude;
  const longitude = card.longitude;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null;
  return {
    id: card.id,
    name: card.title,
    imageUri: card.image?.uri || undefined,
    address: card.Adress,
    description: card.kortbeskrivning,
    latitude,
    longitude,
    distanceKm: card.distanceKm,
    categoryName: card.categoryName,
    hasEvent: card.hasEvent,
    hasOffer: card.hasOffer,
  };
}

function pickCategoryName(business: any): string | undefined {
  if (typeof business?.categoryName === 'string' && business.categoryName.trim()) {
    return business.categoryName.trim();
  }
  if (typeof business?.category?.name === 'string' && business.category.name.trim()) {
    return business.category.name.trim();
  }
  if (Array.isArray(business?.categories) && business.categories[0]) {
    const first = business.categories[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (typeof first?.name === 'string' && first.name.trim()) return first.name.trim();
  }
  return undefined;
}

async function loadActivitySets(): Promise<{
  eventIds: Set<string>;
  offerIds: Set<string>;
}> {
  const eventIds = new Set<string>();
  const offerIds = new Set<string>();
  try {
    const [events, ordersRes] = await Promise.all([
      fetchBusinessEvents(),
      fetch(apiUrl('/orders')),
    ]);
    events.forEach((event) => {
      if (event.businessId) eventIds.add(event.businessId);
    });
    const ordersJson = await ordersRes.json().catch(() => []);
    parseOrdersList(ordersJson).forEach((order) => {
      if (!isActiveOffer(order)) return;
      const businessId = getOrderBusinessId(order);
      if (businessId) offerIds.add(businessId);
    });
  } catch {
    // Activity dots stay inactive if feeds fail.
  }
  return { eventIds, offerIds };
}

export async function loadMapBusinesses(coords: Coords | null): Promise<MapBusiness[]> {
  const activityPromise = loadActivitySets();

  try {
    const json = await fetchApprovedBusinessesCatalog();
    const { eventIds, offerIds } = await activityPromise;
    const raw = parseBusinesses(json);
    const nextCards: NearbyBusinessCard[] = [];
    const mapped: MapBusiness[] = [];

    for (const b of raw) {
      const id = String(b?.id ?? b?._id ?? '');
      if (!id) continue;
      const lat = typeof b?.latitude === 'number' ? b.latitude : Number(b?.latitude);
      const lng = typeof b?.longitude === 'number' ? b.longitude : Number(b?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const name = String(b?.name ?? b?.title ?? 'Företag').trim() || 'Företag';
      const address = [b?.address, b?.city].filter(Boolean).join(', ') || '';
      const description = typeof b?.description === 'string' ? b.description : '';
      const categoryName = pickCategoryName(b);
      const distanceKm =
        coords != null ? haversineKm(coords.lat, coords.lng, lat, lng) : undefined;
      const imageUri = pickImageUri(b);
      const hasEvent = eventIds.has(id);
      const hasOffer = offerIds.has(id);
      mapped.push({
        id,
        name,
        imageUri,
        address,
        description,
        latitude: lat,
        longitude: lng,
        distanceKm,
        categoryName,
        hasEvent,
        hasOffer,
      });
      nextCards.push({
        id,
        title: name,
        image: { uri: imageUri ?? '' },
        Adress: address,
        kortbeskrivning: description,
        långbeskrivning: description,
        latitude: lat,
        longitude: lng,
        distanceKm,
        categoryName,
        hasEvent,
        hasOffer,
      });
    }

    if (nextCards.length > 0) {
      setHomeNearbyBusinessesCache(nextCards);
    }
    if (mapped.length > 0) return mapped;
  } catch {
    // fall through to cache
  }

  const { eventIds, offerIds } = await activityPromise;
  const cached =
    getHomeNearbyBusinessesCache() ?? peekHomeNearbyBusinessesCache() ?? [];
  return cached
    .map(cardToMapBusiness)
    .filter((item): item is MapBusiness => Boolean(item))
    .map((item) => ({
      ...item,
      hasEvent: item.hasEvent ?? eventIds.has(item.id),
      hasOffer: item.hasOffer ?? offerIds.has(item.id),
    }));
}
