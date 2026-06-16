import { apiUrl } from '@/lib/api';

const CATALOG_TTL_MS = 2 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  at: number;
};

let approvedBusinessesCache: CacheEntry<unknown[]> | null = null;
let categoriesCache: CacheEntry<unknown[]> | null = null;
let approvedBusinessesInflight: Promise<unknown[]> | null = null;
let categoriesInflight: Promise<unknown[]> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return Boolean(entry && Date.now() - entry.at < CATALOG_TTL_MS);
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

/** Shared approved-business catalog — dedupes concurrent fetches across screens. */
export async function fetchApprovedBusinessesCatalog(force = false) {
  if (!force && isFresh(approvedBusinessesCache)) {
    return approvedBusinessesCache.data;
  }

  if (!force && approvedBusinessesInflight) {
    return approvedBusinessesInflight;
  }

  approvedBusinessesInflight = (async () => {
    const res = await fetch(apiUrl('/business?status=APPROVED'));
    const json = await res.json().catch(() => []);
    const data = parseBusinessesPayload(json);
    approvedBusinessesCache = { data, at: Date.now() };
    return data;
  })();

  try {
    return await approvedBusinessesInflight;
  } finally {
    approvedBusinessesInflight = null;
  }
}

/** Shared category list — dedupes concurrent fetches across screens. */
export async function fetchCategoriesCatalog(force = false) {
  if (!force && isFresh(categoriesCache)) {
    return categoriesCache.data;
  }

  if (!force && categoriesInflight) {
    return categoriesInflight;
  }

  categoriesInflight = (async () => {
    const res = await fetch(apiUrl('/category'));
    const json = await res.json().catch(() => []);
    const data = parseCategoriesPayload(json);
    categoriesCache = { data, at: Date.now() };
    return data;
  })();

  try {
    return await categoriesInflight;
  } finally {
    categoriesInflight = null;
  }
}

export function invalidateCatalogCache() {
  approvedBusinessesCache = null;
  categoriesCache = null;
}
