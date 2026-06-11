export type MapPoint = {
  latitude: number;
  longitude: number;
};

function formatMapPoint(point: MapPoint) {
  return `${point.latitude},${point.longitude}`;
}

/** Google Maps embed — directions when origin is known, otherwise a destination pin. */
export function buildGoogleMapsEmbedUrl(
  destination: MapPoint,
  addressText: string,
  origin?: MapPoint | null
) {
  const hasDestCoords =
    Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude);
  const destinationQuery = hasDestCoords
    ? formatMapPoint(destination)
    : encodeURIComponent(addressText);

  const hasOrigin =
    origin &&
    Number.isFinite(origin.latitude) &&
    Number.isFinite(origin.longitude);

  if (hasOrigin) {
    const originQuery = formatMapPoint(origin);
    const daddr = hasDestCoords ? destinationQuery : encodeURIComponent(addressText);
    return `https://maps.google.com/maps?saddr=${encodeURIComponent(originQuery)}&daddr=${daddr}&hl=sv&output=embed`;
  }

  return `https://maps.google.com/maps?q=${destinationQuery}&hl=sv&z=15&output=embed`;
}
