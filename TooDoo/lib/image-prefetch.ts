import { Image } from 'expo-image';

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

/** Warm expo-image disk/memory cache for upcoming card renders. */
export async function prefetchImageUris(sources: unknown[], max = 16) {
  const uris = [...new Set(sources.map(extractUri).filter((u): u is string => Boolean(u && isPrefetchable(u))))].slice(
    0,
    max
  );

  if (uris.length === 0) return;

  await Promise.allSettled(uris.map((uri) => Image.prefetch(uri)));
}
