import type { EventFeedItem } from '@/lib/events-feed';
import type { OfferCardItem } from '@/lib/home-offers';

const TTL_MS = 2 * 60 * 1000;
const HOME_SNAPSHOT_TTL_MS = 15 * 60 * 1000;

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
  categoryId?: string;
  categoryIds?: string[];
  categoryName?: string;
  categoryIcon?: string;
  openingHours?: unknown;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

let nearbyBusinessesCache: CacheEntry<NearbyBusinessCard[]> | null = null;
let hotOffersCache: CacheEntry<OfferCardItem[]> | null = null;
let endingSoonCache: CacheEntry<OfferCardItem[]> | null = null;
let eventsCache: CacheEntry<EventFeedItem[]> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return Boolean(entry && Date.now() - entry.at < TTL_MS);
}

export function setHomeNearbyBusinessesCache(data: NearbyBusinessCard[]) {
  nearbyBusinessesCache = { data, at: Date.now() };
}

export function getHomeNearbyBusinessesCache(): NearbyBusinessCard[] | null {
  return isFresh(nearbyBusinessesCache) ? nearbyBusinessesCache.data : null;
}

/** Returns nearby cache even if TTL expired (useful for map while refreshing). */
export function peekHomeNearbyBusinessesCache(): NearbyBusinessCard[] | null {
  return nearbyBusinessesCache?.data ?? null;
}

export function hasFreshHomeNearbyBusinessesCache(): boolean {
  return isFresh(nearbyBusinessesCache);
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

let eventsCacheCity: string | undefined;

export function setHomeEventsCache(data: EventFeedItem[], city?: string | null) {
  eventsCache = { data, at: Date.now() };
  eventsCacheCity = city?.trim() || undefined;
}

export function getHomeEventsCache(): EventFeedItem[] | null {
  return isFresh(eventsCache) ? eventsCache.data : null;
}

export function getHomeEventsCacheCity(): string | undefined {
  return eventsCacheCity;
}

export type HomeFilterCategory = { id: string; label: string };

/** Full Upptäck screen snapshot — keeps UI instant when popping stack on web. */
export type HomeScreenSnapshot = {
  categoryFilters: HomeFilterCategory[];
  deals: unknown[];
  nearYouCards: unknown[];
  hotOfferCards: unknown[];
};

let homeScreenSnapshot: CacheEntry<HomeScreenSnapshot> | null = null;

function isSnapshotFresh(entry: CacheEntry<HomeScreenSnapshot> | null): entry is CacheEntry<HomeScreenSnapshot> {
  return Boolean(entry && Date.now() - entry.at < HOME_SNAPSHOT_TTL_MS);
}

export function setHomeScreenSnapshot(data: HomeScreenSnapshot) {
  homeScreenSnapshot = { data, at: Date.now() };
}

export function getHomeScreenSnapshot(): HomeScreenSnapshot | null {
  return isSnapshotFresh(homeScreenSnapshot) ? homeScreenSnapshot.data : null;
}

export function hasFreshHomeScreenSnapshot(maxAgeMs = HOME_SNAPSHOT_TTL_MS) {
  return Boolean(homeScreenSnapshot && Date.now() - homeScreenSnapshot.at < maxAgeMs);
}

let homeScrollOffsetY = 0;

export function setHomeScrollOffset(y: number) {
  homeScrollOffsetY = Math.max(0, y);
}

export function getHomeScrollOffset() {
  return homeScrollOffsetY;
}

/** Horizontal rail offsets on home (Nära dig, etc.) — survive detail push/pop. */
const homeRailScrollX = new Map<string, number>();

export function setHomeRailScrollOffset(key: string, x: number) {
  if (!key) return;
  homeRailScrollX.set(key, Math.max(0, x));
}

export function getHomeRailScrollOffset(key: string) {
  if (!key) return 0;
  return homeRailScrollX.get(key) ?? 0;
}

export type HomeSearchCache = {
  query: string;
  results: OfferCardItem[];
};

let homeSearchCache: HomeSearchCache = { query: '', results: [] };

export function getHomeSearchCache(): HomeSearchCache {
  return homeSearchCache;
}

export function setHomeSearchCache(query: string, results: OfferCardItem[] = homeSearchCache.results) {
  homeSearchCache = { query, results };
}

export function clearHomeSearchCache() {
  homeSearchCache = { query: '', results: [] };
}
