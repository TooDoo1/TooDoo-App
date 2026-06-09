import type { OfferCardItem } from '@/lib/home-offers';

const TTL_MS = 2 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  at: number;
};

export type NearbyBusinessCard = {
  id: string;
  title: string;
  image: { uri: string };
  Adress: string;
  kortbeskrivning: string;
  långbeskrivning: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

let nearbyBusinessesCache: CacheEntry<NearbyBusinessCard[]> | null = null;
let hotOffersCache: CacheEntry<OfferCardItem[]> | null = null;
let endingSoonCache: CacheEntry<OfferCardItem[]> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return Boolean(entry && Date.now() - entry.at < TTL_MS);
}

export function setHomeNearbyBusinessesCache(data: NearbyBusinessCard[]) {
  nearbyBusinessesCache = { data, at: Date.now() };
}

export function getHomeNearbyBusinessesCache(): NearbyBusinessCard[] | null {
  return isFresh(nearbyBusinessesCache) ? nearbyBusinessesCache.data : null;
}

export function setHomeHotOffersCache(data: OfferCardItem[]) {
  hotOffersCache = { data, at: Date.now() };
}

export function getHomeHotOffersCache(): OfferCardItem[] | null {
  return isFresh(hotOffersCache) ? hotOffersCache.data : null;
}

export function setHomeEndingSoonCache(data: OfferCardItem[]) {
  endingSoonCache = { data, at: Date.now() };
}

export function getHomeEndingSoonCache(): OfferCardItem[] | null {
  return isFresh(endingSoonCache) ? endingSoonCache.data : null;
}
