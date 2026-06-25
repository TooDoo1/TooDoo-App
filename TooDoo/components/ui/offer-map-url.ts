export type MapPoint = {
  latitude: number;
  longitude: number;
};

function formatMapPoint(point: MapPoint) {
  return `${point.latitude},${point.longitude}`;
}

function encodeAddressQuery(addressText: string) {
  return encodeURIComponent(addressText.trim());
}

function hasValidMapPoint(point?: MapPoint | null): point is MapPoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );
}

/** Google Maps embed — directions when origin is known, otherwise destination pin. */
export function buildGoogleMapsEmbedUrl(
  destination: MapPoint,
  addressText: string,
  origin?: MapPoint | null
): string | null {
  const trimmedAddress = addressText?.trim() ?? '';
  const hasAddress = trimmedAddress.length > 0;
  const hasDestCoords = hasValidMapPoint(destination);
  // Prefer the human-readable address — stored lat/lng from the API is often wrong.
  const destinationQuery = hasAddress
    ? encodeAddressQuery(trimmedAddress)
    : hasDestCoords
      ? formatMapPoint(destination)
      : '';

  if (!destinationQuery) {
    return null;
  }

  if (hasValidMapPoint(origin)) {
    const originPoint = formatMapPoint(origin);
    return `https://maps.google.com/maps?f=d&saddr=${originPoint}&daddr=${destinationQuery}&hl=sv&output=embed`;
  }

  return `https://maps.google.com/maps?q=${destinationQuery}&hl=sv&z=15&output=embed`;
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

/** Wrap embed URL in HTML so Google accepts it inside a WebView on native. */
export function buildGoogleMapsEmbedHtml(embedUrl: string): string {
  const src = escapeHtmlAttr(embedUrl);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #e8ecf4; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      title="Karta"
      allowfullscreen
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
    ></iframe>
  </body>
</html>`;
}
