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
