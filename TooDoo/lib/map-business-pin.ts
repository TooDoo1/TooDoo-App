import { OFFER_ACTIVITY_COLOR, EVENT_ACTIVITY_COLOR } from '@/components/ui/company-activity-dots';
import { BrandColors } from '@/lib/brand-colors';
import { sizedImageUrl } from '@/lib/image-url';

export { EVENT_ACTIVITY_COLOR, OFFER_ACTIVITY_COLOR };

/** Largest pin diameter — request CDN variants at this display size. */
const PIN_IMAGE_DISPLAY_WIDTH = 44;

/** Pin-sized variant of a business image URL (Unsplash etc. get tiny files). */
export function pinSizedImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return sizedImageUrl(raw, PIN_IMAGE_DISPLAY_WIDTH);
}

const warmedPinImages = new Map<string, HTMLImageElement>();

/**
 * Decode pin images ahead of marker creation so pins paint instantly.
 * Uses the same sized URL as the marker <img>, so the HTTP cache is shared.
 */
export function warmMapPinImages(uris: Array<string | undefined>, max = 40): void {
  if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
  let count = 0;
  for (const raw of uris) {
    if (count >= max) break;
    const sized = pinSizedImageUrl(raw);
    if (!sized || !/^https?:\/\//i.test(sized) || warmedPinImages.has(sized)) continue;
    count += 1;
    const img = new window.Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = sized;
    warmedPinImages.set(sized, img);
    if (typeof img.decode === 'function') {
      void img.decode().catch(() => {});
    }
  }
}

/** True when a pin photo is already decoded/cached for a smooth first paint. */
export function isMapPinImageReady(raw: string | undefined): boolean {
  const sized = pinSizedImageUrl(raw);
  if (!sized) return false;
  const warmed = warmedPinImages.get(sized);
  return Boolean(warmed?.complete && warmed.naturalWidth > 0);
}

export type BusinessPinOptions = {
  color?: string;
  title?: string;
  imageUri?: string;
  selected?: boolean;
  hasEvent?: boolean;
  hasOffer?: boolean;
  /** Card / "Om oss" surface for the activity badge. */
  badgeBg?: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pinInitial(title?: string) {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) return '•';
  return trimmed.charAt(0).toUpperCase();
}

function activityIconHtml(kind: 'event' | 'offer', color: string) {
  const size = 14;
  const icon =
    kind === 'offer'
      ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.5 3.5 20.5 11.5a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L3.5 12.5V3.5h9Zm-5 4.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" fill="#fff"/></svg>`
      : `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h1.5V5h7V3.5H17V5h2.5A1.5 1.5 0 0 1 21 6.5v12A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-12A1.5 1.5 0 0 1 4.5 5H7V3.5Zm12 7.5H5v7.5h14V11Zm0-2V6.5h-15V9h15Z" fill="#fff"/></svg>`;
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</span>`;
}

/**
 * TooDoo company map pin — round avatar with a small activity badge (event + offer)
 * in the top-left corner.
 */
export function createBusinessPinElement(options: BusinessPinOptions = {}): HTMLButtonElement {
  const color = options.color || '#9b5de5';
  const title = options.title?.trim() || 'Företag';
  const selected = Boolean(options.selected);
  const size = selected ? 44 : 36;
  const initial = escapeXml(pinInitial(options.title));
  const safeColor = escapeXml(color);
  const safeTitle = escapeXml(title);
  const badgeBg = escapeXml(options.badgeBg ?? BrandColors.dark.card);
  const border = selected ? 3.5 : 3;
  const pinImageUri = pinSizedImageUrl(options.imageUri);
  const hasImage = Boolean(pinImageUri && /^https?:\/\//i.test(pinImageUri));
  const hasEvent = Boolean(options.hasEvent);
  const hasOffer = Boolean(options.hasOffer);

  const el = document.createElement('button');
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  // Notes:
  // - never set inline `position` here — it would override MapLibre's
  //   .maplibregl-marker { position:absolute; top:0; left:0 } and make pins
  //   drift when zooming.
  // - no `filter: drop-shadow(...)` — filters re-rasterize on every frame
  //   while the map pans/zooms and make the whole map laggy. The circle
  //   below uses box-shadow instead.
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'padding:0',
    'border:none',
    'background:transparent',
    'cursor:pointer',
    'appearance:none',
    'display:block',
  ].join(';');

  const imageReady = hasImage && isMapPinImageReady(options.imageUri);
  const easeOut = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const initialHtml = `<span data-pin-initial style="font-family:system-ui,-apple-system,sans-serif;font-size:${selected ? 15 : 13}px;font-weight:700;color:${safeColor};line-height:1;z-index:0;opacity:${imageReady ? 0 : 1};transition:opacity 180ms ${easeOut};">${initial}</span>`;
  // Cached photos paint immediately; cold loads use a short opacity fade only.
  const imageHtml = hasImage
    ? `<img data-pin-photo src="${escapeXml(pinImageUri!)}" alt="" decoding="async" loading="eager" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:${imageReady ? 1 : 0};transition:opacity 180ms ${easeOut};z-index:1;" />`
    : '';

  el.innerHTML = `
    <span style="
      position:relative;
      display:block;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:#ffffff;
      box-shadow: inset 0 0 0 ${border}px ${safeColor}, 0 2px 5px rgba(0,0,0,0.28);
    " title="${safeTitle}">
      <span data-pin-face style="
        position:relative;
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:color-mix(in srgb, ${safeColor} 12%, #f3f3f4);
      ">${initialHtml}${imageHtml}</span>
      <span style="
        position:absolute;
        inset:0;
        border-radius:50%;
        box-shadow: inset 0 0 0 ${border}px ${safeColor};
        pointer-events:none;
        z-index:2;
      "></span>
    </span>
    ${
      hasEvent || hasOffer
        ? `<span style="
      position:absolute;
      top:1px;
      left:0px;
      display:flex;
      flex-direction:row;
      align-items:center;
      gap:3px;
      padding:2px 3px;
      border-radius:999px;
      background:${badgeBg};
      box-shadow:0 1px 3px rgba(0,0,0,0.25);
      z-index:3;
    ">
      ${hasEvent ? activityIconHtml('event', EVENT_ACTIVITY_COLOR) : ''}
      ${hasOffer ? activityIconHtml('offer', OFFER_ACTIVITY_COLOR) : ''}
    </span>`
        : ''
    }
  `;

  if (hasImage && !imageReady) {
    const photo = el.querySelector('[data-pin-photo]') as HTMLImageElement | null;
    const initialEl = el.querySelector('[data-pin-initial]') as HTMLElement | null;
    const reveal = () => {
      if (!photo) return;
      requestAnimationFrame(() => {
        photo.style.opacity = '1';
        if (initialEl) initialEl.style.opacity = '0';
      });
    };
    const fallbackToInitial = () => {
      if (!photo) return;
      photo.remove();
      if (initialEl) initialEl.style.opacity = '1';
    };
    if (photo) {
      if (photo.complete && photo.naturalWidth > 0) {
        reveal();
      } else {
        photo.addEventListener('load', reveal, { once: true });
        photo.addEventListener('error', fallbackToInitial, { once: true });
      }
    }
  }

  return el;
}

/**
 * Count badge used when several company pins would overlap at the current zoom.
 */
export function createClusterPinElement(options: {
  count: number;
  color?: string;
}): HTMLButtonElement {
  const count = Math.max(2, Math.round(options.count));
  const color = options.color || BrandColors.dark.primary;
  const safeColor = escapeXml(color);
  const size = count >= 25 ? 46 : count >= 10 ? 42 : 38;
  const label = count > 99 ? '99+' : String(count);

  const el = document.createElement('button');
  el.type = 'button';
  el.title = `${count} företag`;
  el.setAttribute('aria-label', `${count} företag`);
  el.dataset.clusterCount = String(count);
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'padding:0',
    'border:none',
    'background:transparent',
    'cursor:pointer',
    'appearance:none',
    'display:block',
  ].join(';');

  el.innerHTML = `
    <span style="
      position:relative;
      display:flex;
      align-items:center;
      justify-content:center;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:#ffffff;
      box-shadow: inset 0 0 0 3px ${safeColor}, 0 2px 6px rgba(0,0,0,0.32);
    ">
      <span style="
        font-family:system-ui,-apple-system,sans-serif;
        font-size:${count >= 10 ? 13 : 14}px;
        font-weight:700;
        color:${safeColor};
        line-height:1;
        letter-spacing:-0.02em;
      ">${escapeXml(label)}</span>
    </span>
  `;

  return el;
}

/**
 * Resize / restyle an existing pin without remounting the photo
 * (avoids a second fade when selection toggles).
 */
export function updateBusinessPinSelection(
  el: HTMLElement,
  selected: boolean,
  color?: string
): void {
  const size = selected ? 44 : 36;
  const border = selected ? 3.5 : 3;
  const safeColor = escapeXml(color || '#9b5de5');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  const shell = el.firstElementChild as HTMLElement | null;
  if (shell) {
    shell.style.width = `${size}px`;
    shell.style.height = `${size}px`;
    shell.style.boxShadow = `inset 0 0 0 ${border}px ${safeColor}, 0 2px 5px rgba(0,0,0,0.28)`;
  }

  const face = el.querySelector('[data-pin-face]') as HTMLElement | null;
  if (face) {
    face.style.width = `${size}px`;
    face.style.height = `${size}px`;
  }

  const initial = el.querySelector('[data-pin-initial]') as HTMLElement | null;
  if (initial) {
    initial.style.fontSize = `${selected ? 15 : 13}px`;
    initial.style.color = safeColor;
  }

  const ring = shell?.children?.[1] as HTMLElement | null;
  if (ring) {
    ring.style.boxShadow = `inset 0 0 0 ${border}px ${safeColor}`;
  }
}

export function businessPinMarkerOffset(_selected = false): [number, number] {
  return [0, 0];
}

const PIN_CANVAS_DPR = 2;

function loadPinPhoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Canvas pin for MapLibre symbol layers — stays glued to the map while zooming. */
export function createBusinessPinImageData(
  options: BusinessPinOptions = {},
  photo?: HTMLImageElement | null
): ImageData {
  const selected = Boolean(options.selected);
  const cssSize = selected ? 44 : 36;
  const size = Math.round(cssSize * PIN_CANVAS_DPR);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const color = options.color || '#9b5de5';
  const border = (selected ? 3.5 : 3) * PIN_CANVAS_DPR;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - PIN_CANVAS_DPR;

  ctx.beginPath();
  ctx.arc(cx, cy + PIN_CANVAS_DPR, radius * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const innerR = Math.max(2, radius - border);
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#f3f3f4';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.clip();
  if (photo && photo.width > 0) {
    const dim = innerR * 2;
    const scale = Math.max(dim / photo.width, dim / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round((selected ? 15 : 13) * PIN_CANVAS_DPR)}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pinInitial(options.title), cx, cy + PIN_CANVAS_DPR * 0.4);
  }
  ctx.restore();

  const badgeBg = options.badgeBg ?? BrandColors.dark.card;
  const hasEvent = Boolean(options.hasEvent);
  const hasOffer = Boolean(options.hasOffer);
  if (hasEvent || hasOffer) {
    const icon = 14 * PIN_CANVAS_DPR;
    const pad = 2 * PIN_CANVAS_DPR;
    const gap = 3 * PIN_CANVAS_DPR;
    const count = (hasEvent ? 1 : 0) + (hasOffer ? 1 : 0);
    const badgeW = pad * 2 + icon * count + gap * Math.max(0, count - 1);
    const badgeH = icon + pad * 2;
    const bx = PIN_CANVAS_DPR;
    const by = PIN_CANVAS_DPR;
    ctx.beginPath();
    const rr = badgeH / 2;
    ctx.moveTo(bx + rr, by);
    ctx.arcTo(bx + badgeW, by, bx + badgeW, by + badgeH, rr);
    ctx.arcTo(bx + badgeW, by + badgeH, bx, by + badgeH, rr);
    ctx.arcTo(bx, by + badgeH, bx, by, rr);
    ctx.arcTo(bx, by, bx + badgeW, by, rr);
    ctx.closePath();
    ctx.fillStyle = badgeBg;
    ctx.fill();

    const drawIcon = (x: number, fill: string, kind: 'event' | 'offer') => {
      ctx.beginPath();
      ctx.arc(x, by + badgeH / 2, icon / 2, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      if (kind === 'offer') {
        // Simple pricetag mark
        ctx.beginPath();
        ctx.moveTo(x - 2.2 * PIN_CANVAS_DPR, by + badgeH / 2 - 2.4 * PIN_CANVAS_DPR);
        ctx.lineTo(x + 2.6 * PIN_CANVAS_DPR, by + badgeH / 2 + 2.4 * PIN_CANVAS_DPR);
        ctx.lineTo(x + 0.8 * PIN_CANVAS_DPR, by + badgeH / 2 + 2.4 * PIN_CANVAS_DPR);
        ctx.lineTo(x - 4 * PIN_CANVAS_DPR, by + badgeH / 2 - 0.8 * PIN_CANVAS_DPR);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 2.2 * PIN_CANVAS_DPR, by + badgeH / 2 - 1.6 * PIN_CANVAS_DPR, 0.9 * PIN_CANVAS_DPR, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      } else {
        // Simple calendar mark
        const top = by + badgeH / 2 - 2.6 * PIN_CANVAS_DPR;
        const left = x - 2.6 * PIN_CANVAS_DPR;
        ctx.fillRect(left, top + 1.2 * PIN_CANVAS_DPR, 5.2 * PIN_CANVAS_DPR, 4.2 * PIN_CANVAS_DPR);
        ctx.fillStyle = fill;
        ctx.fillRect(left + 0.7 * PIN_CANVAS_DPR, top + 2.4 * PIN_CANVAS_DPR, 3.8 * PIN_CANVAS_DPR, 2.4 * PIN_CANVAS_DPR);
      }
    };

    let x = bx + pad + icon / 2;
    if (hasEvent) {
      drawIcon(x, EVENT_ACTIVITY_COLOR, 'event');
      x += icon + gap;
    }
    if (hasOffer) {
      drawIcon(x, OFFER_ACTIVITY_COLOR, 'offer');
    }
  }

  return ctx.getImageData(0, 0, size, size);
}

export const BUSINESS_PIN_IMAGE_PIXEL_RATIO = PIN_CANVAS_DPR;

export async function loadBusinessPinPhoto(
  imageUri: string | undefined
): Promise<HTMLImageElement | null> {
  const url = pinSizedImageUrl(imageUri);
  if (!url || !/^https?:\/\//i.test(url) || typeof window === 'undefined') return null;
  return loadPinPhoto(url);
}
