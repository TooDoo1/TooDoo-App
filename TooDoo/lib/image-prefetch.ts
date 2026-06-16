import { useEffect } from 'react';
import { Image } from 'expo-image';
import { InteractionManager, Platform } from 'react-native';

const PREFETCH_CONCURRENCY = 4;
const DEFAULT_MAX = 16;

function extractUri(source: unknown): string | undefined {
  if (typeof source === 'string' && source.trim()) return source.trim();
  if (typeof source === 'object' && source && 'uri' in source) {
    const uri = (source as { uri?: unknown }).uri;
    if (typeof uri === 'string' && uri.trim()) return uri.trim();
  }
  return undefined;
}

function isPrefetchable(uri: string) {
  if (!uri.startsWith('http://') && !uri.startsWith('https://')) return false;
  if (uri.includes('picsum.photos')) return false;
  return true;
}

function uniquePrefetchableUris(sources: unknown[], max: number) {
  return [
    ...new Set(sources.map(extractUri).filter((uri): uri is string => Boolean(uri && isPrefetchable(uri)))),
  ].slice(0, max);
}

function prefetchCachePolicy(): 'disk' | 'memory-disk' {
  return Platform.OS === 'web' ? 'disk' : 'memory-disk';
}

async function prefetchUris(uris: string[]) {
  if (uris.length === 0) return;

  const cachePolicy = prefetchCachePolicy();

  for (let i = 0; i < uris.length; i += PREFETCH_CONCURRENCY) {
    const batch = uris.slice(i, i + PREFETCH_CONCURRENCY);
    await Promise.allSettled(batch.map((uri) => Image.prefetch(uri, { cachePolicy })));
  }
}

/** Warm expo-image disk/memory cache for upcoming card renders. */
export async function prefetchImageUris(sources: unknown[], max = DEFAULT_MAX) {
  await prefetchUris(uniquePrefetchableUris(sources, max));
}

/** Defer prefetch until after interactions / idle time so scrolling stays smooth. */
export function schedulePrefetchImageUris(sources: unknown[], max = DEFAULT_MAX) {
  const uris = uniquePrefetchableUris(sources, max);
  if (uris.length === 0) return;

  const run = () => {
    void prefetchUris(uris);
  };

  if (Platform.OS === 'web' && typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 });
    return;
  }

  InteractionManager.runAfterInteractions(run);
}

/** Prefetch images for the current page and the next page in paginated lists. */
export function usePrefetchPageImages<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  options?: {
    max?: number;
    extraPages?: number;
    resetKey?: string | number;
    selectImage?: (item: T) => unknown;
  }
) {
  const { max, extraPages = 1, resetKey, selectImage } = options ?? {};
  const prefetchMax = max ?? pageSize * (1 + extraPages);

  useEffect(() => {
    const start = page * pageSize;
    const end = Math.min(items.length, start + pageSize * (1 + extraPages));
    if (start >= end) return;

    const resolveImage =
      selectImage ??
      ((item: T) => (item as { image?: unknown }).image);

    schedulePrefetchImageUris(
      items.slice(start, end).map((item) => resolveImage(item)),
      prefetchMax
    );
  }, [items, page, pageSize, prefetchMax, extraPages, resetKey, selectImage]);
}
