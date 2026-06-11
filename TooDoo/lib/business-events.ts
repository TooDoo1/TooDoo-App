import type { ImageSourcePropType } from 'react-native';

import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { formatBusinessAddress } from '@/lib/home-offers';

export type BusinessEventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleTo: string;
  locationName?: string;
  businessId: string;
  businessName: string;
  businessCity?: string;
  businessAddress?: string;
  categoryName?: string;
  image?: ImageSourcePropType;
  interestCount?: number;
};

function parseEventsPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.events)) return obj.events;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

export function mapApiBusinessEvent(raw: any): BusinessEventItem {
  const eventId = String(raw?.id ?? raw?._id ?? 'event');
  const business = raw?.business ?? {};
  const businessId = String(business?.id ?? business?._id ?? raw?.businessId ?? eventId);

  const imageUri = normalizeImageUrl(
    raw?.image?.publicUrl ??
      raw?.image?.url ??
      raw?.imageUrl ??
      business?.image?.publicUrl ??
      business?.imageUrl
  );

  return {
    id: eventId,
    title: raw?.title ?? 'Evenemang',
    description: raw?.description ?? '',
    startsAt: raw?.startsAt ?? '',
    endsAt: raw?.endsAt ?? '',
    visibleFrom: raw?.visibleFrom ?? '',
    visibleTo: raw?.visibleTo ?? '',
    locationName: raw?.locationName ?? undefined,
    businessId,
    businessName: business?.name ?? 'Okänd verksamhet',
    businessCity: business?.city ?? undefined,
    businessAddress: formatBusinessAddress(business),
    categoryName: business?.category?.name ?? business?.categoryName ?? undefined,
    ...(imageUri ? { image: { uri: imageUri } } : {}),
    interestCount:
      typeof raw?._count?.interests === 'number'
        ? raw._count.interests
        : typeof raw?.interestCount === 'number'
          ? raw.interestCount
          : undefined,
  };
}

/** API returns events ordered by startsAt ascending; keep that order client-side. */
export function sortBusinessEvents(events: BusinessEventItem[]): BusinessEventItem[] {
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

export function formatInterestCount(count?: number): string {
  const value = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return value > 100 ? '100+' : String(value);
}

export function formatEventDateRange(event: BusinessEventItem): string | null {
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

export async function registerEventInterest(eventId: string, token: string): Promise<boolean> {
  const response = await fetch(apiUrl(`/business-events/${encodeURIComponent(eventId)}/interest`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

export async function removeEventInterest(eventId: string, token: string): Promise<boolean> {
  const response = await fetch(apiUrl(`/business-events/${encodeURIComponent(eventId)}/interest`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok || response.status === 404;
}

export async function fetchBusinessEvents(options?: {
  businessId?: string;
  categoryName?: string;
  city?: string;
}): Promise<BusinessEventItem[]> {
  const params = new URLSearchParams();
  if (options?.businessId) params.set('businessId', options.businessId);
  if (options?.categoryName) params.set('categoryName', options.categoryName);
  if (options?.city) params.set('city', options.city);

  const query = params.toString();
  const response = await fetch(apiUrl(`/business-events${query ? `?${query}` : ''}`));
  if (!response.ok) {
    return [];
  }

  const json = await response.json().catch(() => ({}));
  return sortBusinessEvents(parseEventsPayload(json).map(mapApiBusinessEvent));
}
