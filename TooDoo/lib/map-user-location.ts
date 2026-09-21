/** Same red as the community downvote arrow. */
export const USER_LOCATION_ARROW_COLOR = '#ff3b30';
/** Slightly darker half for a two-tone arrow. */
export const USER_LOCATION_ARROW_COLOR_DARK = '#c92a22';

/**
 * DOM marker for MapLibre: small two-tone triangle with a bottom indent.
 */
export function createUserLocationArrowElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Din plats');
  el.style.cssText =
    'width:22px;height:22px;display:flex;align-items:center;justify-content:center;' +
    'pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));';
  // Tip at top; bottom edge has a shallow V indent toward the center.
  el.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 2 L11 15.5 L4 19.5 Z" fill="${USER_LOCATION_ARROW_COLOR_DARK}" />
      <path d="M11 2 L18 19.5 L11 15.5 Z" fill="${USER_LOCATION_ARROW_COLOR}" />
    </svg>
  `;
  return el;
}
