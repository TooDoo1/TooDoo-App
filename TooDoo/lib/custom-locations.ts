import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Coords } from '@/lib/geo';

const STORAGE_KEY = 'toodoo:custom-locations:v1';
export const MAX_CUSTOM_LOCATIONS = 3;

export type CustomLocation = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export type CustomLocationsState = {
  locations: CustomLocation[];
  /** When set, app uses this spot instead of device GPS. */
  activeId: string | null;
};

const EMPTY_STATE: CustomLocationsState = {
  locations: [],
  activeId: null,
};

type Listener = (state: CustomLocationsState) => void;
const listeners = new Set<Listener>();

function notify(state: CustomLocationsState) {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // ignore subscriber errors
    }
  });
}

/** Subscribe to custom-location changes (active place, add/remove). */
export function subscribeCustomLocations(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function newId() {
  return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readState(): Promise<CustomLocationsState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<CustomLocationsState>;
    const locations = Array.isArray(parsed.locations)
      ? parsed.locations.filter(
          (item): item is CustomLocation =>
            Boolean(
              item &&
                typeof item.id === 'string' &&
                typeof item.label === 'string' &&
                typeof item.lat === 'number' &&
                typeof item.lng === 'number'
            )
        )
      : [];
    const activeId =
      typeof parsed.activeId === 'string' &&
      locations.some((item) => item.id === parsed.activeId)
        ? parsed.activeId
        : null;
    return { locations: locations.slice(0, MAX_CUSTOM_LOCATIONS), activeId };
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(state: CustomLocationsState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notify(state);
}

export async function loadCustomLocationsState(): Promise<CustomLocationsState> {
  return readState();
}

export async function getActiveCustomLocation(): Promise<CustomLocation | null> {
  const state = await readState();
  if (!state.activeId) return null;
  return state.locations.find((item) => item.id === state.activeId) ?? null;
}

/** Coords for the selected custom place, or null when using device location. */
export async function getActiveCustomLocationCoords(): Promise<Coords | null> {
  const active = await getActiveCustomLocation();
  if (!active) return null;
  return { lat: active.lat, lng: active.lng };
}

export async function setActiveCustomLocationId(
  id: string | null
): Promise<CustomLocationsState> {
  const state = await readState();
  if (id != null && !state.locations.some((item) => item.id === id)) {
    return state;
  }
  const next = { ...state, activeId: id };
  await writeState(next);
  return next;
}

export async function addCustomLocation(input: {
  label: string;
  address: string;
  lat: number;
  lng: number;
}): Promise<{ state: CustomLocationsState; error?: string }> {
  const state = await readState();
  if (state.locations.length >= MAX_CUSTOM_LOCATIONS) {
    return {
      state,
      error: `Du kan spara högst ${MAX_CUSTOM_LOCATIONS} platser.`,
    };
  }
  const label = input.label.trim() || 'Plats';
  const address = input.address.trim();
  const location: CustomLocation = {
    id: newId(),
    label,
    address,
    lat: input.lat,
    lng: input.lng,
  };
  const locations = [...state.locations, location];
  const next: CustomLocationsState = {
    locations,
    // First saved place becomes active if nothing was selected.
    activeId: state.activeId ?? location.id,
  };
  await writeState(next);
  return { state: next };
}

export async function removeCustomLocation(
  id: string
): Promise<CustomLocationsState> {
  const state = await readState();
  const locations = state.locations.filter((item) => item.id !== id);
  const activeId =
    state.activeId === id
      ? locations[0]?.id ?? null
      : state.activeId && locations.some((item) => item.id === state.activeId)
        ? state.activeId
        : null;
  const next = { locations, activeId };
  await writeState(next);
  return next;
}
