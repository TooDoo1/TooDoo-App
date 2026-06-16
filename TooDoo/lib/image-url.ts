import { PixelRatio, Platform } from 'react-native';

import { normalizeImageUrl } from '@/lib/api';

/** Common display widths — request CDN variants at 2× for retina. */
export const IMAGE_DISPLAY_WIDTH = {
  thumb: 112,
  card: 168,
  cardWide: 336,
  hero: 768,
} as const;

function targetPixelWidth(displayWidth: number) {
  const dpr =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? Math.min(window.devicePixelRatio || 1, 2)
      : PixelRatio.get();
  return Math.max(64, Math.ceil(displayWidth * Math.min(dpr, 2)));
}

function appendQueryParam(url: string, key: string, value: string | number) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${value}`;
}

/**
 * Return a URL sized for the display width when the host supports it.
 * Falls back to the original URL for unknown hosts (still downscaled in UI).
 */
export function sizedImageUrl(raw: unknown, displayWidth: number): string | undefined {
  const normalized = normalizeImageUrl(raw);
  if (!normalized || !Number.isFinite(displayWidth) || displayWidth <= 0) {
    return normalized;
  }

  if (/[?&]w=\d+/.test(normalized)) {
    return normalized;
  }

  const width = targetPixelWidth(displayWidth);

  if (normalized.includes('images.unsplash.com/')) {
    const withWidth = appendQueryParam(normalized, 'w', width);
    return `${withWidth}&fit=crop&auto=format&q=80`;
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
