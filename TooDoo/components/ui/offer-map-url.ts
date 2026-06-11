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

/** Google Maps embed — directions when origin is known, otherwise a destination pin. */
export function buildGoogleMapsEmbedUrl(
  destination: MapPoint,
  addressText: string,
  origin?: MapPoint | null
) {
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

  const hasOrigin =
    origin &&
    Number.isFinite(origin.latitude) &&
    Number.isFinite(origin.longitude);

  if (hasOrigin) {
    const originQuery = formatMapPoint(origin);
    const daddr = hasAddress ? encodeAddressQuery(trimmedAddress) : destinationQuery;
    return `https://maps.google.com/maps?saddr=${encodeURIComponent(originQuery)}&daddr=${daddr}&hl=sv&output=embed`;
  }

  return `https://maps.google.com/maps?q=${destinationQuery}&hl=sv&z=15&output=embed`;
}
