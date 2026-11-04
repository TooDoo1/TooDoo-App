import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Coords } from '@/lib/geo';

const STORAGE_KEY = 'toodoo:region-selection:v1';

export type RegionSelection = {
  lan: string;
  city: string;
  lat: number;
  lng: number;
};

type Listener = (selection: RegionSelection | null) => void;
const listeners = new Set<Listener>();

function notify(selection: RegionSelection | null) {
  listeners.forEach((listener) => {
    try {
      listener(selection);
    } catch {
      // ignore
    }
  });
}

export function subscribeRegionSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function readSelection(): Promise<RegionSelection | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegionSelection>;
    if (
      typeof parsed.lan === 'string' &&
      typeof parsed.city === 'string' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number'
    ) {
      return {
        lan: parsed.lan,
        city: parsed.city,
        lat: parsed.lat,
        lng: parsed.lng,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadRegionSelection(): Promise<RegionSelection | null> {
  return readSelection();
}

export async function getRegionSelectionCoords(): Promise<Coords | null> {
  const selection = await readSelection();
  if (!selection) return null;
  return { lat: selection.lat, lng: selection.lng };
}

export async function setRegionSelection(
  selection: RegionSelection
): Promise<RegionSelection> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  notify(selection);
  return selection;
}

export async function clearRegionSelection(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  notify(null);
}
