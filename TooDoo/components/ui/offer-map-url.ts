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

/** Google Maps embed — destination pin (directions open via external maps link). */
export function buildGoogleMapsEmbedUrl(
  destination: MapPoint,
  addressText: string
): string | null {
  const trimmedAddress = addressText?.trim() ?? '';
  const hasAddress = trimmedAddress.length > 0;
  const hasDestCoords =
    Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude);
  // Prefer the human-readable address — stored lat/lng from the API is often wrong.
  const destinationQuery = hasAddress
    ? encodeAddressQuery(trimmedAddress)
    : hasDestCoords
      ? formatMapPoint(destination)
      : '';

  if (!destinationQuery) {
    return null;
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
