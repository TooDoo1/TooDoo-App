import { apiUrl, fetchWithTimeout } from '@/lib/api';
import { resolveEventFeedCity } from '@/lib/events-feed';
import type { Coords } from '@/lib/geo';

/** Default page size for city-scoped /business requests. */
export const NEARBY_PAGE_SIZE = 24;

/** Hard caps — never pull the national catalog for these surfaces. */
export const UTFORSKA_BUSINESS_CAP = 72;
export const MAP_BUSINESS_CANDIDATE_CAP = 48;
export const NARA_DIG_BUSINESS_CAP = 60;

export type FetchApprovedBusinessPageOptions = {
  city?: string | null;
  skip?: number;
  take?: number;
  signal?: AbortSignal;
};

function parseBusinessesPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

/**
 * One page of approved businesses.
 * Backend supports `status`, `city`, `take`, and `skip` on GET /business.
 */
export async function fetchApprovedBusinessPage(
  options: FetchApprovedBusinessPageOptions = {}
): Promise<unknown[]> {
  const take = Math.min(Math.max(options.take ?? NEARBY_PAGE_SIZE, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const params = new URLSearchParams();
  params.set('status', 'APPROVED');
  params.set('take', String(take));
  if (skip > 0) params.set('skip', String(skip));
  const city = options.city?.trim();
  if (city) params.set('city', city);

  const res = await fetchWithTimeout(apiUrl(`/business?${params.toString()}`), {
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`business page failed: ${res.status}`);
  }
  const json = await res.json().catch(() => []);
  return parseBusinessesPayload(json);
}

export type FetchCityBusinessesOptions = {
  city?: string | null;
  coords?: Coords | null;
  /** Total businesses to return (across pages). */
  take?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

/**
 * City-scoped approved businesses, paged until `take` is reached.
 * Resolves city from coords when possible (Helsingborg seed); otherwise
 * fetches a capped national page so we still never download ~2000 rows.
 */
export async function fetchCityApprovedBusinesses(
  options: FetchCityBusinessesOptions = {}
): Promise<{ businesses: unknown[]; city?: string; hasMore: boolean }> {
  const pageSize = Math.min(Math.max(options.pageSize ?? NEARBY_PAGE_SIZE, 1), 100);
  const take = Math.min(Math.max(options.take ?? pageSize, 1), 200);
  const city =
    options.city?.trim() ||
    resolveEventFeedCity(options.city, options.coords) ||
    undefined;

  const out: unknown[] = [];
  let skip = 0;
  let hasMore = true;

  while (out.length < take) {
    const batchTake = Math.min(pageSize, take - out.length);
    const page = await fetchApprovedBusinessPage({
      city,
      skip,
      take: batchTake,
      signal: options.signal,
    });
    out.push(...page);
    if (page.length < batchTake) {
      hasMore = false;
      break;
    }
    skip += page.length;
    if (skip >= take) {
      // There may be more on the server past our hard cap.
      hasMore = true;
      break;
    }
  }

  return { businesses: out.slice(0, take), city, hasMore };
}
