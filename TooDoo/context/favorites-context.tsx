import { Alert } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FavoritesContextValue = {
  favoriteBusinessIds: Set<string>;
  isFavorite: (businessId: string) => boolean;
  toggleFavorite: (businessId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

/**
 * Stable per-id subscription store: list cards subscribe to one id each, so
 * toggling a favorite re-renders that card's heart instead of every card.
 */
type FavoritesStore = {
  subscribe: (listener: () => void) => () => void;
  getIds: () => Set<string>;
  toggleFavorite: (businessId: string) => Promise<void>;
};

const FavoritesStoreContext = createContext<FavoritesStore | undefined>(undefined);

const FAVORITES_CACHE_PREFIX = 'toodoo_favorite_business_ids_';

function parseFavoriteIds(payload: any): string[] {
  const candidates: unknown[] =
    payload?.favoriteBusinessIds ??
    payload?.favoriteBusinesses ??
    payload?.favorites ??
    payload?.favorite_businesses ??
    [];

  if (Array.isArray(candidates)) {
    return candidates
      .map((x) => (typeof x === 'string' ? x : (x as { id?: string; _id?: string })?.id ?? (x as { id?: string; _id?: string })?._id))
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
  }

  return [];
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { token, role, authFetch, isAuthReady } = useAuth();
  const [favoriteBusinessIds, setFavoriteBusinessIds] = useState<Set<string>>(new Set());

  const refreshFavorites = useCallback(async () => {
    if (!isAuthReady || !token) {
      if (isAuthReady) setFavoriteBusinessIds(new Set());
      return;
    }
    try {
      const res = await authFetch('/user/me');
      const json = await res.json().catch(() => ({}));
      const ids = parseFavoriteIds(json);
      if (ids.length > 0) {
        const next = new Set(ids.map(String));
        setFavoriteBusinessIds(next);
        try {
          const userKey = String(json?.id ?? json?.email ?? 'me');
          await AsyncStorage.setItem(
            `${FAVORITES_CACHE_PREFIX}${userKey}`,
            JSON.stringify(Array.from(next))
          );
        } catch {
          // ignore cache write errors
        }
        return;
      }

      // Fallback: if the API doesn't return favorites on /user/me, use local cache.
      try {
        const userKey = String(json?.id ?? json?.email ?? 'me');
        const cached = await AsyncStorage.getItem(`${FAVORITES_CACHE_PREFIX}${userKey}`);
        const parsed = cached ? JSON.parse(cached) : null;
        if (Array.isArray(parsed)) {
          setFavoriteBusinessIds(new Set(parsed.map(String)));
        }
      } catch {
        // ignore
      }
    } catch {
      // keep last known state on transient failures
    }
  }, [authFetch, isAuthReady, token]);

  useEffect(() => {
    void refreshFavorites();
  }, [refreshFavorites]);

  const isFavorite = useCallback(
    (businessId: string) => favoriteBusinessIds.has(String(businessId)),
    [favoriteBusinessIds]
  );

  const toggleFavorite = useCallback(
    async (businessId: string) => {
      const id = String(businessId);
      if (!token) return;
      if (role && role !== 'USER') {
        Alert.alert('Kan inte spara favorit', 'Endast användarkonton kan spara favoriter.');
        return;
      }

      const currentlyFavorite = favoriteBusinessIds.has(id);
      const nextSet = new Set(favoriteBusinessIds);
      if (currentlyFavorite) nextSet.delete(id);
      else nextSet.add(id);
      setFavoriteBusinessIds((prev) => {
        const next = new Set(prev);
        if (currentlyFavorite) next.delete(id);
        else next.add(id);
        return next;
      });

      try {
        const endpoint = currentlyFavorite
          ? `/user/me/unfavorite-business/${encodeURIComponent(id)}`
          : `/user/me/favorite-business/${encodeURIComponent(id)}`;
        const res = await authFetch(endpoint, {
          method: currentlyFavorite ? 'DELETE' : 'POST',
        });
        if (!res.ok) {
          if (res.status === 403) {
            Alert.alert('Kan inte spara favorit', 'Endast användarkonton kan spara favoriter.');
          }
          throw new Error(`Favorite request failed: ${res.status}`);
        }

        // Persist locally as well (covers cases where /user/me doesn't return favorites).
        void (async () => {
          try {
            const meRes = await fetch(apiUrl('/user/me'), {
              headers: { Authorization: `Bearer ${token}` },
            });
            const me = await meRes.json().catch(() => ({}));
            const userKey = String(me?.id ?? me?.email ?? 'me');
            await AsyncStorage.setItem(
              `${FAVORITES_CACHE_PREFIX}${userKey}`,
              JSON.stringify(Array.from(nextSet))
            );
          } catch {
            // ignore
          }
        })();
      } catch {
        // revert optimistic update on failure
        setFavoriteBusinessIds((prev) => {
          const next = new Set(prev);
          if (currentlyFavorite) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    },
    [authFetch, favoriteBusinessIds, token, role]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteBusinessIds,
      isFavorite,
      toggleFavorite,
      refreshFavorites,
    }),
    [favoriteBusinessIds, isFavorite, toggleFavorite, refreshFavorites]
  );

  const idsRef = useRef(favoriteBusinessIds);
  const listenersRef = useRef(new Set<() => void>());
  const toggleRef = useRef(toggleFavorite);
  toggleRef.current = toggleFavorite;

  useLayoutEffect(() => {
    idsRef.current = favoriteBusinessIds;
    listenersRef.current.forEach((listener) => listener());
  }, [favoriteBusinessIds]);

  const store = useMemo<FavoritesStore>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getIds: () => idsRef.current,
      toggleFavorite: (businessId) => toggleRef.current(businessId),
    }),
    []
  );

  return (
    <FavoritesStoreContext.Provider value={store}>
      <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
    </FavoritesStoreContext.Provider>
  );
}

/** Re-renders only when this one business flips favorite state. */
export function useIsFavorite(businessId: string) {
  const store = useContext(FavoritesStoreContext);
  if (!store) throw new Error('useIsFavorite must be used inside FavoritesProvider');
  const id = String(businessId);
  return useSyncExternalStore(store.subscribe, () => store.getIds().has(id));
}

/** Stable toggle that never changes identity. */
export function useToggleFavorite() {
  const store = useContext(FavoritesStoreContext);
  if (!store) throw new Error('useToggleFavorite must be used inside FavoritesProvider');
  return store.toggleFavorite;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}

