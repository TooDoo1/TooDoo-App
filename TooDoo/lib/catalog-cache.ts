import { apiUrl } from '@/lib/api';
import { rememberCategories } from '@/lib/category-colors';

const CATALOG_TTL_MS = 2 * 60 * 1000;
/** Bump when the fetch shape changes so an in-memory first-page cache is dropped. */
const APPROVED_CATALOG_VERSION = 4;
const APPROVED_PAGE_SIZE = 100;
const APPROVED_MAX_PAGES = 20;

type CacheEntry<T> = {
  data: T;
  at: number;
  version?: number;
};

let approvedBusinessesCache: CacheEntry<unknown[]> | null = null;
let categoriesCache: CacheEntry<unknown[]> | null = null;
let approvedBusinessesInflight: Promise<unknown[]> | null = null;
let categoriesInflight: Promise<unknown[]> | null = null;

function isFresh<T>(
  entry: CacheEntry<T> | null,
  version?: number
): entry is CacheEntry<T> {
  return Boolean(
    entry &&
      (version == null || entry.version === version) &&
      Date.now() - entry.at < CATALOG_TTL_MS
  );
}

function catalogItemId(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const rec = item as { id?: unknown; _id?: unknown };
  return String(rec.id ?? rec._id ?? '').trim();
}

const APPROVED_PAGE_BATCH = 4;

async function fetchApprovedBusinessPage(page: number): Promise<unknown[]> {
  const skip = page * APPROVED_PAGE_SIZE;
  const path =
    skip > 0
      ? `/business?status=APPROVED&skip=${skip}`
      : '/business?status=APPROVED';
  const res = await fetch(apiUrl(path));
  const json = await res.json().catch(() => []);
  return parseBusinessesPayload(json);
}

async function fetchAllApprovedBusinessPages(): Promise<unknown[]> {
  const byId = new Map<string, unknown>();
  const unkeyed: unknown[] = [];

  const collect = (data: unknown[]) => {
    for (const item of data) {
      const id = catalogItemId(item);
      if (id) byId.set(id, item);
      else unkeyed.push(item);
    }
  };

  // Pages are fetched in parallel batches — serial paging made a cold catalog
  // load cost one round-trip per 100 businesses.
  let page = 0;
  while (page < APPROVED_MAX_PAGES) {
    const batchSize = Math.min(APPROVED_PAGE_BATCH, APPROVED_MAX_PAGES - page);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, i) => fetchApprovedBusinessPage(page + i))
    );
    let sawShortPage = false;
    for (const data of batch) {
      collect(data);
      if (data.length < APPROVED_PAGE_SIZE) sawShortPage = true;
    }
    if (sawShortPage) break;
    page += batchSize;
  }

  return [...byId.values(), ...unkeyed];
}

function parseBusinessesPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function parseCategoriesPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.categories)) return obj.categories;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function startApprovedBusinessesRefresh(): Promise<unknown[]> {
  const inflight = (async () => {
    const data = await fetchAllApprovedBusinessPages();
    approvedBusinessesCache = {
      data,
      at: Date.now(),
      version: APPROVED_CATALOG_VERSION,
    };
    return data;
  })();
  approvedBusinessesInflight = inflight;
  void inflight.finally(() => {
    if (approvedBusinessesInflight === inflight) {
      approvedBusinessesInflight = null;
    }
  });
  return inflight;
}

/** In-memory catalog snapshot — never hits the network. */
export function peekApprovedBusinessesCatalog(): unknown[] | null {
  if (
    approvedBusinessesCache &&
    approvedBusinessesCache.version === APPROVED_CATALOG_VERSION
  ) {
    return approvedBusinessesCache.data;
  }
  return null;
}

/** Shared approved-business catalog — dedupes concurrent fetches across screens. */
export async function fetchApprovedBusinessesCatalog(force = false) {
  if (!force && isFresh(approvedBusinessesCache, APPROVED_CATALOG_VERSION)) {
    return approvedBusinessesCache.data;
  }

  if (!force && approvedBusinessesInflight) {
    return approvedBusinessesInflight;
  }

  // Stale-while-revalidate: an expired (but shape-compatible) catalog is served
  // instantly — e.g. on a location switch — while a background refresh updates
  // the cache for the next read. The catalog is city-independent, so staleness
  // only delays newly approved businesses, never local correctness.
  if (
    !force &&
    approvedBusinessesCache &&
    approvedBusinessesCache.version === APPROVED_CATALOG_VERSION
  ) {
    const refresh = startApprovedBusinessesRefresh();
    void refresh.catch(() => {
      // Keep serving the stale snapshot if the refresh fails.
    });
    return approvedBusinessesCache.data;
  }

  const inflight = startApprovedBusinessesRefresh();
  return inflight;
}

function startCategoriesRefresh(): Promise<unknown[]> {
  const inflight = (async () => {
    const res = await fetch(apiUrl('/category'));
    const json = await res.json().catch(() => []);
    const data = parseCategoriesPayload(json);
    rememberCategories(data);
    categoriesCache = { data, at: Date.now() };
    return data;
  })();
  categoriesInflight = inflight;
  void inflight.finally(() => {
    if (categoriesInflight === inflight) {
      categoriesInflight = null;
    }
  });
  return inflight;
}

/** Shared category list — dedupes concurrent fetches across screens. */
export async function fetchCategoriesCatalog(force = false) {
  if (!force && isFresh(categoriesCache)) {
    rememberCategories(categoriesCache.data);
    return categoriesCache.data;
  }

  if (!force && categoriesInflight) {
    return categoriesInflight;
  }

  // Stale-while-revalidate — categories almost never change, so an expired list
  // is still correct enough to paint with while a refresh runs behind.
  if (!force && categoriesCache) {
    const refresh = startCategoriesRefresh();
    void refresh.catch(() => {});
    rememberCategories(categoriesCache.data);
    return categoriesCache.data;
  }

  return startCategoriesRefresh();
}

export function invalidateCatalogCache() {
  approvedBusinessesCache = null;
  categoriesCache = null;
}
