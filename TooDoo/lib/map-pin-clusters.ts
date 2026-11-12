/** Minimal pin shape — kept local to avoid importing the map view module. */
export type ClusterablePin = {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  selected?: boolean;
};

export type MapClusterItem<T extends ClusterablePin = ClusterablePin> =
  | {
      kind: 'pin';
      id: string;
      latitude: number;
      longitude: number;
      pin: T;
    }
  | {
      kind: 'cluster';
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      memberIds: string[];
      /** Accent from the first member — keeps cluster color family consistent. */
      color: string;
    };

/** Approx metres-per-pixel at the given latitude / Web-Mercator zoom. */
function metersPerPixel(latitude: number, zoom: number): number {
  return (
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom)
  );
}

/** Snap zoom so tiny wheel/pinch deltas don't reshuffle clusters. */
export function clusterZoomBucket(zoom: number): number {
  return Math.round(zoom * 2) / 2;
}

/**
 * Collapse only pins whose icons would stack on screen.
 *
 * Uses a capped grid so a city overview stays spread out — nearby blocks
 * stay separate instead of chaining into one giant downtown badge.
 */
export function clusterMapPins<T extends ClusterablePin>(
  pins: T[],
  zoom: number,
  /** Screen distance (px) under which pins share a cell. */
  mergePx = 34
): MapClusterItem<T>[] {
  if (pins.length === 0) return [];

  const zoomBucket = clusterZoomBucket(zoom);

  // Street-level: keep every company pin visible.
  if (zoomBucket >= 15.5) {
    return pins.map((pin) => ({
      kind: 'pin' as const,
      id: pin.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
      pin,
    }));
  }

  const selected = pins.filter((p) => p.selected);
  const rest = pins.filter((p) => !p.selected);
  if (rest.length === 0) {
    return selected.map((pin) => ({
      kind: 'pin' as const,
      id: pin.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
      pin,
    }));
  }

  const midLat =
    rest.reduce((sum, p) => sum + p.latitude, 0) / Math.max(rest.length, 1);
  const mpp = metersPerPixel(midLat, zoomBucket);
  // Cap metres so zoomed-out city views don't swallow whole districts.
  const thresholdM = Math.min(72, Math.max(20, mergePx * mpp));
  const cellLat = thresholdM / 111_320;
  const cellLng =
    thresholdM / (111_320 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));

  const buckets = new Map<string, T[]>();
  for (const pin of rest) {
    const x = Math.floor(pin.longitude / cellLng);
    const y = Math.floor(pin.latitude / cellLat);
    const key = `${x}:${y}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(pin);
    else buckets.set(key, [pin]);
  }

  const items: MapClusterItem<T>[] = [];
  for (const members of buckets.values()) {
    if (members.length === 1) {
      const pin = members[0]!;
      items.push({
        kind: 'pin',
        id: pin.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        pin,
      });
      continue;
    }

    const lat = members.reduce((s, p) => s + p.latitude, 0) / members.length;
    const lng = members.reduce((s, p) => s + p.longitude, 0) / members.length;
    const memberIds = members.map((m) => m.id).sort();
    items.push({
      kind: 'cluster',
      id: `cluster:${memberIds.join('|')}`,
      latitude: lat,
      longitude: lng,
      count: members.length,
      memberIds,
      color: members[0]?.color || '#478beb',
    });
  }

  for (const pin of selected) {
    items.push({
      kind: 'pin',
      id: pin.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
      pin,
    });
  }

  return items;
}
