import { PixelRatio, Platform } from 'react-native';

import { normalizeImageUrl } from '@/lib/api';

/** Common display widths — request CDN variants at 2× for retina. */
export const IMAGE_DISPLAY_WIDTH = {
  thumb: 112,
  card: 168,
  cardWide: 336,
  /** Featured carousel slide (~72% of screen), not full-bleed hero. */
  featured: 320,
  hero: 768,
} as const;

function targetPixelWidth(displayWidth: number) {
  const dpr =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? Math.min(window.devicePixelRatio || 1, 2)
      : PixelRatio.get();
  return Math.max(64, Math.ceil(displayWidth * Math.min(dpr, 2)));
}

/**
 * Return a URL sized for the display width when the host supports it.
 * Falls back to the original URL for unknown hosts (still downscaled in UI).
 *
 * Unsplash URLs often arrive with w=1200 already set — rewrite that to the
 * on-screen size so Android does not decode hundreds of MB of unused pixels.
 */
export function sizedImageUrl(raw: unknown, displayWidth: number): string | undefined {
  const normalized = normalizeImageUrl(raw);
  if (!normalized || !Number.isFinite(displayWidth) || displayWidth <= 0) {
    return normalized;
  }

  const width = targetPixelWidth(displayWidth);

  if (normalized.includes('images.unsplash.com/')) {
    try {
      const url = new URL(normalized);
      url.searchParams.set('w', String(width));
      if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'crop');
      if (!url.searchParams.has('auto')) url.searchParams.set('auto', 'format');
      url.searchParams.set('q', url.searchParams.get('q') || '75');
      return url.toString();
    } catch {
      return normalized;
    }
  }

  // Already explicitly sized by the source — leave alone for non-Unsplash hosts.
  if (/[?&]w=\d+/.test(normalized)) {
    return normalized;
  }

  // Backend / R2 uploads — no transform API yet; keep original.
  return normalized;
}

export function sizedImageSource(
  source: { uri?: string } | string | undefined,
  displayWidth: number
): { uri: string } | undefined {
  const raw =
    typeof source === 'string'
      ? source
      : typeof source === 'object' && source?.uri
        ? source.uri
        : undefined;
  const uri = sizedImageUrl(raw, displayWidth);
  return uri ? { uri } : undefined;
}
