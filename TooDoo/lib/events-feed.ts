import type { ImageSourcePropType } from 'react-native';

import { apiUrl, fetchWithTimeout, normalizeImageUrl } from '@/lib/api';
import {
  fetchBusinessEvents,
  formatEventDateRange,
  type BusinessEventItem,
} from '@/lib/business-events';
import { HELSINGBORG_COORDS } from '@/lib/geo';
import {
  fetchMunicipioEvents,
  formatMunicipioEventDateRange,
  type MunicipioEventItem,
} from '@/lib/municipio-events';

export type EventFeedItem = {
  id: string;
  source: 'business' | 'municipio';
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  image?: ImageSourcePropType;
  latitude?: number;
  longitude?: number;
  businessId?: string;
  categoryId?: string;
  categoryName?: string;
  businessEvent?: BusinessEventItem;
  municipioEvent?: MunicipioEventItem;
};

function toBusinessFeedItem(event: BusinessEventItem): EventFeedItem {
  return {
    id: `business:${event.id}`,
    source: 'business',
    title: event.title,
    subtitle: event.businessName,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    image: event.image,
    latitude: event.latitude,
    longitude: event.longitude,
    businessId: event.businessId,
    categoryName: event.categoryName,
    businessEvent: event,
  };
}

function toMunicipioFeedItem(event: MunicipioEventItem): EventFeedItem {
  return {
    id: `municipio:${event.id}`,
    source: 'municipio',
    title: event.title,
    subtitle: event.locationLabel ?? 'Evenemang',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    image: event.image,
    latitude: event.latitude,
    longitude: event.longitude,
    categoryId: event.categoryId,
    categoryName: event.categoryName,
    municipioEvent: event,
  };
}

const EVENT_TZ = 'Europe/Stockholm';

function sortFeedItems(events: EventFeedItem[]): EventFeedItem[] {
  return [...events].sort((a, b) => {
    const aMs = Date.parse(a.startsAt);
    const bMs = Date.parse(b.startsAt);
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
      return aMs - bMs;
    }
    if (Number.isFinite(aMs) && !Number.isFinite(bMs)) return -1;
    if (!Number.isFinite(aMs) && Number.isFinite(bMs)) return 1;
    return a.title.localeCompare(b.title, 'sv');
  });
}

function stockholmDayKey(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function isUpcomingFeedEvent(event: EventFeedItem, now = new Date()): boolean {
  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);
  if (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs >= startMs && endMs >= now.getTime()) {
    return true;
  }
  if (!Number.isFinite(startMs)) return false;
  if (startMs >= now.getTime()) return true;
  return stockholmDayKey(new Date(startMs)) >= stockholmDayKey(now);
}

export function formatFeedEventDateRange(event: EventFeedItem): string | null {
  if (event.source === 'business' && event.businessEvent) {
    return formatEventDateRange(event.businessEvent);
  }
  if (event.source === 'municipio' && event.municipioEvent) {
    return formatMunicipioEventDateRange(event.municipioEvent);
  }
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
}

export function getFeedEventStartParts(
  event: EventFeedItem
): { day: string; month: string; time: string } | null {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return null;

  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TZ,
    day: 'numeric',
  }).format(start);
  const month = new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TZ,
    month: 'short',
  })
    .format(start)
    .replace('.', '')
    .toUpperCase()
    .slice(0, 3);
  const time = new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);

  return { day, month, time };
}

export const EVENT_FEED_DAYS = 14;

/** How many events the home strip shows — always the first items of the Visa alla list. */
export const HOME_EVENT_TICKET_COUNT = 8;

/**
 * Same city rule for the home Evenemang strip and Visa alla, so they cannot diverge.
 */
export function resolveEventFeedCity(
  city?: string | null,
  coords?: { lat: number; lng: number } | null
): string | undefined {
  const trimmed = city?.trim();
  if (trimmed) return trimmed;
  // ~5–6 km — wide enough for GPS + picker points around Helsingborg.
  if (
    coords &&
    Math.abs(coords.lat - HELSINGBORG_COORDS.lat) < 0.05 &&
    Math.abs(coords.lng - HELSINGBORG_COORDS.lng) < 0.05
  ) {
    return 'Helsingborg';
  }
  return undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8211;/gi, '–')
    .replace(/&#8212;/gi, '—')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    })
    .trim();
}

function parsePlaceCoords(place: unknown): { lat?: number; lng?: number; label?: string } {
  if (typeof place !== 'string' || !place.trim()) return {};
  try {
    const parsed = JSON.parse(place);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!row || typeof row !== 'object') return { label: place };
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const label =
      typeof row.name === 'string'
        ? row.name
        : typeof row.address === 'string'
          ? row.address
          : undefined;
    return {
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      label,
    };
  } catch {
    return { label: place };
  }
}

function mapUnifiedFeedRow(row: Record<string, unknown>): EventFeedItem | null {
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const kind = String(row.kind ?? '').toLowerCase();
  const source: EventFeedItem['source'] = kind === 'business' ? 'business' : 'municipio';
  const title = decodeHtml(String(row.title ?? 'Evenemang'));
  const placeInfo = parsePlaceCoords(row.place);
  const cityLabel =
    typeof row.city === 'string' && row.city.trim() ? row.city.trim() : undefined;
  const subtitle = placeInfo.label || cityLabel || 'Evenemang';
  const imageUrl = normalizeImageUrl(
    typeof row.imageUrl === 'string' ? row.imageUrl : undefined
  );
  const startsAt = String(row.start ?? row.startsAt ?? '');
  const endsAt = String(row.end ?? row.endsAt ?? startsAt);
  return {
    id: `${source}:${id}`,
    source,
    title,
    subtitle,
    startsAt,
    endsAt,
    image: imageUrl ? { uri: imageUrl } : undefined,
    latitude: placeInfo.lat,
    longitude: placeInfo.lng,
    businessId: typeof row.businessId === 'string' ? row.businessId : undefined,
    categoryName: typeof row.categoryName === 'string' ? row.categoryName : undefined,
  };
}

async function fetchUnifiedEventsFeed(options?: {
  limit?: number;
  city?: string;
  days?: number;
}): Promise<EventFeedItem[] | null> {
  const city = options?.city?.trim();
  if (!city) return null;
  const params = new URLSearchParams({
    city,
    days: String(options?.days ?? EVENT_FEED_DAYS),
    take: String(Math.min(Math.max(options?.limit ?? 100, 1), 100)),
  });
  const res = await fetchWithTimeout(apiUrl(`/events/feed?${params.toString()}`));
  if (!res.ok) return null;
  const json = await res.json().catch(() => []);
  const rows = Array.isArray(json)
    ? json
    : Array.isArray((json as { events?: unknown[] })?.events)
      ? (json as { events: unknown[] }).events
      : [];
  const mapped = sortFeedItems(
    rows
      .map((row) => mapUnifiedFeedRow(row as Record<string, unknown>))
      .filter((row): row is EventFeedItem => Boolean(row))
      .filter((event) => isUpcomingFeedEvent(event))
  );
  return mapped;
}

export async function fetchEventFeed(options?: {
  limit?: number;
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  days?: number;
}): Promise<EventFeedItem[]> {
  const city = options?.city?.trim() || undefined;

  try {
    const unified = await fetchUnifiedEventsFeed({
      city,
      days: options?.days,
      limit: options?.limit && options.limit > 0 ? Math.max(options.limit, 40) : 100,
    });
    if (unified && unified.length > 0) {
      const limit = options?.limit;
      if (typeof limit === 'number' && limit > 0) {
        return unified.slice(0, limit);
      }
      return unified;
    }
  } catch {
    // Fall through to legacy dual-feed.
  }

  const [businessEvents, municipioEvents] = await Promise.all([
    fetchBusinessEvents(),
    fetchMunicipioEvents({
      city,
      lat: options?.lat,
      lng: options?.lng,
      radiusKm: options?.radiusKm,
      days: options?.days ?? EVENT_FEED_DAYS,
      take: 100,
    }),
  ]);

  const merged = sortFeedItems(
    [
      ...businessEvents.map(toBusinessFeedItem),
      ...municipioEvents.map(toMunicipioFeedItem),
    ].filter((event) => isUpcomingFeedEvent(event))
  );

  const limit = options?.limit;
  if (typeof limit === 'number' && limit > 0) {
    return merged.slice(0, limit);
  }

  return merged;
}
