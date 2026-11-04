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

const warmedPinImages = new Set<string>();

/**
 * Decode pin images ahead of marker creation so pins paint instantly.
 * Uses the same sized URL as the marker <img>, so the HTTP cache is shared.
 */
export function warmMapPinImages(uris: Array<string | undefined>, max = 30): void {
  if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
  let count = 0;
  for (const raw of uris) {
    if (count >= max) break;
    const sized = pinSizedImageUrl(raw);
    if (!sized || !/^https?:\/\//i.test(sized) || warmedPinImages.has(sized)) continue;
    warmedPinImages.add(sized);
    count += 1;
    const img = new window.Image();
    img.decoding = 'async';
    img.src = sized;
  }
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

function miniDotHtml(active: boolean, color: string) {
  const size = 5;
  const fill = active ? color : 'rgba(255,255,255,0.28)';
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};display:inline-block;flex-shrink:0;"></span>`;
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

  // Eager + high priority: only ~10 pins render at once and they're the main
  // content of the map — lazy loading just delayed them until after layout.
  const content = hasImage
    ? `<img src="${escapeXml(pinImageUri!)}" alt="" decoding="async" loading="eager" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.parentElement&&(this.parentElement.textContent='${initial}');" />`
    : `<span style="font-family:system-ui,-apple-system,sans-serif;font-size:${selected ? 15 : 13}px;font-weight:700;color:${safeColor};line-height:1;">${initial}</span>`;

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
      <span style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#f3f3f4;
      ">${content}</span>
      <span style="
        position:absolute;
        inset:0;
        border-radius:50%;
        box-shadow: inset 0 0 0 ${border}px ${safeColor};
        pointer-events:none;
      "></span>
    </span>
    <span style="
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
      z-index:2;
    ">
      ${miniDotHtml(hasEvent, EVENT_ACTIVITY_COLOR)}
      ${miniDotHtml(hasOffer, OFFER_ACTIVITY_COLOR)}
    </span>
  `;

  return el;
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
  const dot = 5 * PIN_CANVAS_DPR;
  const pad = 2 * PIN_CANVAS_DPR;
  const badgeW = pad * 2 + dot * 2 + 3 * PIN_CANVAS_DPR;
  const badgeH = dot + pad * 2;
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

  const drawDot = (x: number, active: boolean, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, by + badgeH / 2, dot / 2, 0, Math.PI * 2);
    ctx.fillStyle = active ? fill : 'rgba(255,255,255,0.28)';
    ctx.fill();
  };
  drawDot(bx + pad + dot / 2, hasEvent, EVENT_ACTIVITY_COLOR);
  drawDot(bx + pad + dot + 3 * PIN_CANVAS_DPR + dot / 2, hasOffer, OFFER_ACTIVITY_COLOR);

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
