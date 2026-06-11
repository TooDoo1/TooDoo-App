type CompanyDetailCacheEntry = {
  business: any;
  orders: any[];
  images: Record<string, string>;
  counts: Record<string, { claimed: number; total: number }>;
  at: number;
};

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CompanyDetailCacheEntry>();

export function getCachedCompanyDetail(businessId: string) {
  const entry = cache.get(businessId);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    if (entry) cache.delete(businessId);
    return null;
  }
  return entry;
}

export function setCachedCompanyDetail(
  businessId: string,
  data: Omit<CompanyDetailCacheEntry, 'at'>
) {
  cache.set(businessId, { ...data, at: Date.now() });
}

export function patchCachedCompanyDetailImages(
  businessId: string,
  images: Record<string, string>,
  counts: Record<string, { claimed: number; total: number }>
) {
  const entry = cache.get(businessId);
  if (!entry || Date.now() - entry.at > TTL_MS) return;
  cache.set(businessId, {
    ...entry,
    images: { ...entry.images, ...images },
    counts: { ...entry.counts, ...counts },
    at: entry.at,
  });
}
