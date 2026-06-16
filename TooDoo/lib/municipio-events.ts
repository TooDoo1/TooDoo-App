import type { ImageSourcePropType } from 'react-native';

import { apiUrl, normalizeImageUrl } from '@/lib/api';

export type MunicipioEventLocation = {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export type MunicipioEventItem = {
  url: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  locationLabel?: string;
  locations: MunicipioEventLocation[];
  latitude?: number;
  longitude?: number;
  image?: ImageSourcePropType;
};

function parseEventsPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.events)) return obj.events;
  return [];
}

function toIsoFromUnixSeconds(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && /^\d+$/.test(value.trim())) {
      return new Date(asNumber * 1000).toISOString();
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return '';
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCoordinate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pickEventCoordinates(
  locations: MunicipioEventLocation[]
): { latitude?: number; longitude?: number } {
  for (const location of locations) {
    const latitude = location.latitude;
    const longitude = location.longitude;
    if (
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude)
    ) {
      return { latitude, longitude };
    }
  }
  return {};
}

function formatLocationEntry(location: MunicipioEventLocation): string | null {
  const name = location.name?.trim();
  const address = location.address?.trim();
  if (name && address) return `${name}, ${address}`;
  return name ?? address ?? null;
}

export function formatMunicipioLocations(locations: MunicipioEventLocation[]): string | undefined {
  const labels = locations
    .map(formatLocationEntry)
    .filter((entry): entry is string => Boolean(entry));
  if (labels.length === 0) return undefined;
  return labels.join(' · ');
}

export function mapApiMunicipioEvent(raw: any): MunicipioEventItem | null {
  const url = String(raw?.url ?? raw?.id ?? '').trim();
  if (!url) return null;

  const locations: MunicipioEventLocation[] = Array.isArray(raw?.location)
    ? raw.location.map((entry: any) => ({
        name: typeof entry?.name === 'string' ? entry.name : undefined,
        address: typeof entry?.address === 'string' ? entry.address : undefined,
        latitude: parseCoordinate(entry?.latitude ?? entry?.lat),
        longitude: parseCoordinate(entry?.longitude ?? entry?.lng ?? entry?.lon),
      }))
    : [];

  const locationLabel = formatMunicipioLocations(locations);
  const { latitude, longitude } = pickEventCoordinates(locations);
  const imageUri = normalizeImageUrl(raw?.image);

  return {
    url,
    title: raw?.name ?? raw?.title ?? 'Evenemang',
    description: stripHtml(String(raw?.description ?? '')),
    startsAt: toIsoFromUnixSeconds(raw?.startDate),
    endsAt: toIsoFromUnixSeconds(raw?.endDate),
    locationLabel,
    locations,
    ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
    ...(imageUri ? { image: { uri: imageUri } } : {}),
  };
}

export function sortMunicipioEvents(events: MunicipioEventItem[]): MunicipioEventItem[] {
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

export function formatMunicipioEventDateRange(event: MunicipioEventItem): string | null {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (!Number.isFinite(start.getTime())) return null;

  const dateFmt = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const startDate = dateFmt.format(start);
  const startTime = timeFmt.format(start);

  if (!Number.isFinite(end.getTime())) {
    return `${startDate} ${startTime}`;
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    return `${startDate} ${startTime}–${timeFmt.format(end)}`;
  }

  return `${startDate} ${startTime} – ${dateFmt.format(end)} ${timeFmt.format(end)}`;
}

export async function fetchMunicipioEvents(): Promise<MunicipioEventItem[]> {
  const response = await fetch(apiUrl('/events'));
  if (!response.ok) {
    return [];
  }

  const json = await response.json().catch(() => ({}));
  return sortMunicipioEvents(
    parseEventsPayload(json)
      .map(mapApiMunicipioEvent)
      .filter((event): event is MunicipioEventItem => event != null)
  );
}

export async function fetchMunicipioEventByUrl(url: string): Promise<MunicipioEventItem | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const response = await fetch(apiUrl(`/events/${encodeURIComponent(trimmed)}`));
  if (!response.ok) {
    return null;
  }

  const json = await response.json().catch(() => null);
  return mapApiMunicipioEvent(json);
}
