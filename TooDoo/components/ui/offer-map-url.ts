/**
 * Leaflet + Carto raster for Hitta hit (reliable in web iframes).
 * MapLibre/OpenFreeMap is better for full color control once mounted in the DOM
 * (not srcDoc) — see public/map-styles/README.md.
 */
import type { ThemeMode } from '@/context/theme-preference-context';
import { mapShellBackground, MAP_ATTRIBUTION } from '@/lib/map-style';

export type MapPoint = {
  latitude: number;
  longitude: number;
};

function hasValidMapPoint(point?: MapPoint | null): point is MapPoint {
  return Boolean(
    point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildOpenStreetMapBrowseUrl(
  destination: MapPoint,
  addressText?: string
): string | null {
  if (hasValidMapPoint(destination)) {
    const { latitude, longitude } = destination;
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  }

  const trimmed = addressText?.trim() ?? '';
  if (!trimmed) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(trimmed)}`;
}

/** Leaflet + Carto raster — reliable in srcDoc; used as emergency fallback HTML. */
export function buildStyledLeafletMapHtml(options: {
  destination: MapPoint;
  title?: string;
  mode: ThemeMode;
  markerColor?: string;
  zoom?: number;
}): string | null {
  const { destination, title, mode, markerColor = '#ff3b30', zoom = 15 } = options;
  if (!hasValidMapPoint(destination)) return null;

  const { latitude, longitude } = destination;
  const tile =
    mode === 'dark'
      ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const bg = mapShellBackground(mode);
  const label = escapeHtmlText(title?.trim() || 'Plats');
  const attr = escapeHtmlText(MAP_ATTRIBUTION);
  const safeColor = escapeHtmlAttr(markerColor);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${bg}; }
      .leaflet-control-attribution { font-size: 10px !important; background: rgba(14,19,37,0.75) !important; color: rgba(255,255,255,0.75) !important; }
      .leaflet-control-attribution a { color: #6c9ef5 !important; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <script>
      var map = L.map('map', { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false })
        .setView([${latitude}, ${longitude}], ${zoom});
      L.tileLayer('${tile}', {
        attribution: '${attr}',
        maxZoom: 19
      }).addTo(map);
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${safeColor};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);transform:rotate(-45deg);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22]
      });
      L.marker([${latitude}, ${longitude}], { icon: icon, title: '${escapeHtmlAttr(label)}', interactive: false }).addTo(map);
      setTimeout(function () { map.invalidateSize(); }, 50);
    <\/script>
  </body>
</html>`;
}

export function buildStyledMapLibreHtml(options: {
  destination: MapPoint;
  title?: string;
  mode: ThemeMode;
  markerColor?: string;
  zoom?: number;
  styleUrl?: string;
}): string | null {
  // Prefer Leaflet in srcDoc — MapLibre WebGL/workers often fail inside about:srcdoc.
  return buildStyledLeafletMapHtml(options);
}

// re-export for callers that still import style helper from here
export { mapLibreStyleUrlForMode } from '@/lib/map-style';

export function buildOpenStreetMapEmbedUrl(
  destination: MapPoint,
  _addressText?: string
): string | null {
  if (!hasValidMapPoint(destination)) return null;
  const { latitude, longitude } = destination;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

export const buildGoogleMapsEmbedUrl = (
  destination: MapPoint,
  addressText: string,
  _origin?: MapPoint | null
) => buildOpenStreetMapEmbedUrl(destination, addressText);

export function buildOpenStreetMapEmbedHtml(embedUrl: string): string {
  const src = escapeHtmlAttr(embedUrl);
  return `<!DOCTYPE html><html><body style="margin:0"><iframe src="${src}" style="border:0;width:100%;height:100%"></iframe></body></html>`;
}

export const buildGoogleMapsEmbedHtml = buildOpenStreetMapEmbedHtml;
