import type { ImageSourcePropType } from 'react-native';

import {
  fetchBusinessEvents,
  formatEventDateRange,
  type BusinessEventItem,
} from '@/lib/business-events';
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
    businessEvent: event,
  };
}

function toMunicipioFeedItem(event: MunicipioEventItem): EventFeedItem {
  return {
    id: `municipio:${event.url}`,
    source: 'municipio',
    title: event.title,
    subtitle: event.locationLabel ?? 'Helsingborg',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    image: event.image,
    latitude: event.latitude,
    longitude: event.longitude,
    municipioEvent: event,
  };
}

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

export function formatFeedEventDateRange(event: EventFeedItem): string | null {
  if (event.source === 'business' && event.businessEvent) {
    return formatEventDateRange(event.businessEvent);
  }
  if (event.source === 'municipio' && event.municipioEvent) {
    return formatMunicipioEventDateRange(event.municipioEvent);
  }
  return null;
}

export function getFeedEventStartParts(
  event: EventFeedItem
): { day: string; month: string } | null {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return null;

  const day = new Intl.DateTimeFormat('sv-SE', { day: 'numeric' }).format(start);
  const month = new Intl.DateTimeFormat('sv-SE', { month: 'short' })
    .format(start)
    .replace('.', '')
    .toUpperCase()
    .slice(0, 3);

  return { day, month };
}

export async function fetchEventFeed(): Promise<EventFeedItem[]> {
  const [businessEvents, municipioEvents] = await Promise.all([
    fetchBusinessEvents(),
    fetchMunicipioEvents(),
  ]);

  return sortFeedItems([
    ...businessEvents.map(toBusinessFeedItem),
    ...municipioEvents.map(toMunicipioFeedItem),
  ]);
}
