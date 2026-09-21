import { OFFER_ACTIVITY_COLOR, EVENT_ACTIVITY_COLOR } from '@/components/ui/company-activity-dots';
import { BrandColors } from '@/lib/brand-colors';
import { OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';

export { EVENT_ACTIVITY_COLOR, OFFER_ACTIVITY_COLOR };

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
  const color = options.color ?? OFFERS_CATEGORY_ACCENT;
  const title = options.title?.trim() || 'Företag';
  const selected = Boolean(options.selected);
  const size = selected ? 44 : 36;
  const initial = escapeXml(pinInitial(options.title));
  const safeColor = escapeXml(color);
  const safeTitle = escapeXml(title);
  const badgeBg = escapeXml(options.badgeBg ?? BrandColors.dark.card);
  const border = selected ? 3.5 : 3;
  const inner = size - border * 2;
  const hasImage = Boolean(options.imageUri && /^https?:\/\//i.test(options.imageUri ?? ''));
  const hasEvent = Boolean(options.hasEvent);
  const hasOffer = Boolean(options.hasOffer);

  const el = document.createElement('button');
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'padding:0',
    'border:none',
    'background:transparent',
    'cursor:pointer',
    'appearance:none',
    'display:block',
    'position:relative',
    selected
      ? 'filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35))'
      : 'filter:drop-shadow(0 2px 5px rgba(0,0,0,0.28))',
  ].join(';');

  const content = hasImage
    ? `<img src="${escapeXml(options.imageUri!)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<span style="font-family:system-ui,-apple-system,sans-serif;font-size:${selected ? 15 : 13}px;font-weight:700;color:${safeColor};line-height:1;">${initial}</span>`;

  el.innerHTML = `
    <span style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      border:${border}px solid ${safeColor};
      background:#ffffff;
      overflow:hidden;
      box-sizing:border-box;
    " title="${safeTitle}">
      <span style="
        width:${inner}px;
        height:${inner}px;
        border-radius:50%;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#f3f3f4;
      ">${content}</span>
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
