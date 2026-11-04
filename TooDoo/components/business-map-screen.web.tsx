import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusinessMapSearchHeader } from '@/components/ui/business-map-search-header';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import {
  MapLibreMapView,
  type MapLibrePin,
} from '@/components/ui/maplibre-map.web';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  filterBusinessesByQuery,
  filterBusinessesForViewport,
  hasMapPinCoords,
  loadMapBusinesses,
  MAP_DEFAULT_CENTER,
  mergeSearchHitsIntoMapBusinesses,
  peekCachedMapBusinesses,
  searchMapBusinesses,
  type MapBusiness,
  type MapViewBounds,
} from '@/lib/business-map-data';
import { getCategoryAccentForItem, OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { subscribeCustomLocations } from '@/lib/custom-locations';
import {
  getEffectiveUserCoords,
  getEffectiveUserCoordsIfGranted,
  getUserCoords,
  getUserCoordsIfGranted,
  geocodeAddressCached,
  haversineKm,
  HELSINGBORG_COORDS,
  type Coords,
} from '@/lib/geo';
import { warmMapPinImages } from '@/lib/map-business-pin';
import { MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { mapShellBackground } from '@/lib/map-style';
import {
  fetchTravelRoutes,
  formatRouteSummary,
  type DrivingRoute,
  type TravelRoutes,
} from '@/lib/osrm-route';
import { uiTheme } from '@/lib/ui-theme';
import { useFocusEffect } from '@react-navigation/native';

const NEAR_YOU_ZOOM = 13.35;
const NEAR_YOU_FIT_RADIUS_KM = 3.5;
const NEAR_YOU_FIT_COUNT = 12;

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function sameCoords(a: Coords | null | undefined, b: Coords | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

function nearbyFitCoordinates(
  businesses: MapBusiness[],
  userCoords: Coords | null,
  limit = NEAR_YOU_FIT_COUNT
): Array<{ latitude: number; longitude: number }> | null {
  if (!userCoords) return null;

  const nearby = [...businesses]
    .filter(
      (b) =>
        Number.isFinite(b.latitude) &&
        Number.isFinite(b.longitude) &&
        typeof b.distanceKm === 'number' &&
        b.distanceKm <= NEAR_YOU_FIT_RADIUS_KM
    )
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, limit);

  if (nearby.length === 0) return null;

  return [
    { latitude: userCoords.lat, longitude: userCoords.lng },
    ...nearby.map((b) => ({
      latitude: b.latitude,
      longitude: b.longitude,
    })),
  ];
}

const HELSINGBORG = {
  latitude: MAP_DEFAULT_CENTER.lat,
  longitude: MAP_DEFAULT_CENTER.lng,
};

function RouteChip({
  route,
  backgroundColor,
  color,
}: {
  route: DrivingRoute;
  backgroundColor: string;
  color: string;
}) {
  const accent = route.mode === 'walking' ? '#30d158' : '#0a84ff';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor,
      }}
    >
      <Ionicons
        name={route.mode === 'walking' ? 'walk' : 'car'}
        size={14}
        color={accent}
      />
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>
        {formatRouteSummary(route)}
      </Text>
    </View>
  );
}

export default function BusinessMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string | string[];
    returnTo?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  // Tab bar is hidden on this stack screen — only reserve the home-indicator inset.
  const bottomPad = Math.max(insets.bottom, 12) + 16;
  const fromNaraDig = paramString(params.returnTo) === 'naradig';
  const mapZoom = fromNaraDig ? NEAR_YOU_ZOOM : 12.6;

  const [pinsLoading, setPinsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>(() =>
    peekCachedMapBusinesses()
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));
  const [catalogHits, setCatalogHits] = useState<MapBusiness[] | null>(null);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [viewBounds, setViewBounds] = useState<MapViewBounds | null>(null);

  const mapCenter = useMemo(() => {
    if (userCoords) {
      return { latitude: userCoords.lat, longitude: userCoords.lng };
    }
    return HELSINGBORG;
  }, [userCoords]);

  const nearYouFitCoordinates = useMemo(() => {
    if (!fromNaraDig) return null;
    return nearbyFitCoordinates(businesses, userCoords);
  }, [businesses, fromNaraDig, userCoords]);

  const loadedCoordsRef = useRef<Coords | null>(null);
  const loadGenRef = useRef(0);
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;

  const refreshForCoords = useCallback(async (next: Coords | null) => {
    if (!next) return;
    if (sameCoords(loadedCoordsRef.current, next)) {
      setUserCoords((prev) => (sameCoords(prev, next) ? prev : next));
      return;
    }
    loadedCoordsRef.current = next;
    setUserCoords(next);
    setBusinesses((prev) =>
      [...prev]
        .map((b) => ({
          ...b,
          distanceKm: hasMapPinCoords(b)
            ? haversineKm(next.lat, next.lng, b.latitude, b.longitude)
            : b.distanceKm,
        }))
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    );
    const gen = ++loadGenRef.current;
    try {
      const mapped = await loadMapBusinesses(next, (partial) => {
        if (loadGenRef.current !== gen) return;
        setBusinesses(partial);
        setPinsLoading(false);
      });
      if (loadGenRef.current !== gen) return;
      setBusinesses(mapped);
    } catch {
      // keep locally re-ranked pins
    } finally {
      if (loadGenRef.current === gen) setPinsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const coords = await getEffectiveUserCoords().catch(() => null);
      if (cancelled || !coords) {
        if (!cancelled) setPinsLoading(false);
        return;
      }
      await refreshForCoords(coords);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshForCoords]);

  useEffect(
    () =>
      subscribeCustomLocations((state) => {
        void (async () => {
          if (state.activeId) {
            const active = state.locations.find((item) => item.id === state.activeId);
            if (active) {
              await refreshForCoords({ lat: active.lat, lng: active.lng });
              return;
            }
          }
          const gps =
            (await getUserCoordsIfGranted().catch(() => null)) ??
            (await getUserCoords().catch(() => null)) ??
            HELSINGBORG_COORDS;
          await refreshForCoords(gps);
        })();
      }),
    [refreshForCoords]
  );

  useFocusEffect(
    useCallback(() => {
      void getEffectiveUserCoordsIfGranted()
        .catch(() => null)
        .then((coords) => {
          if (coords) void refreshForCoords(coords);
        });
    }, [refreshForCoords])
  );

  const selected = useMemo(
    () =>
      catalogHits?.find((b) => b.id === selectedId) ??
      businesses.find((b) => b.id === selectedId) ??
      null,
    [businesses, catalogHits, selectedId]
  );

  const [routes, setRoutes] = useState<TravelRoutes | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++routeRequestRef.current;
    if (!selected || !userCoords) {
      setRoutes(null);
      setRouteLoading(false);
      return;
    }
    setRouteLoading(true);
    setRoutes(null);
    void fetchTravelRoutes(
      { lat: userCoords.lat, lng: userCoords.lng },
      { lat: selected.latitude, lng: selected.longitude }
    ).then((result) => {
      if (routeRequestRef.current !== requestId) return;
      setRoutes(result);
      setRouteLoading(false);
    });
  }, [selected, userCoords]);

  const drivingLine = routes?.driving?.coordinates ?? null;
  const walkingLine = routes?.walking?.coordinates ?? null;

  const matchedBusinesses = useMemo(
    () => filterBusinessesByQuery(businesses, searchQuery),
    [businesses, searchQuery]
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setCatalogHits(null);
      setSearchingCatalog(false);
      return;
    }
    let cancelled = false;
    setSearchingCatalog(true);
    setCatalogHits(null);
    const timer = setTimeout(() => {
      void searchMapBusinesses(query, businessesRef.current, userCoords)
        .then((hits) => {
          if (cancelled) return;
          setCatalogHits(hits);
          if (hits.length > 0) {
            setBusinesses((prev) => mergeSearchHitsIntoMapBusinesses(prev, hits));
          }
          if (hits.length === 1) {
            setSelectedId(hits[0].id);
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingCatalog(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, userCoords]);

  const visibleMatches =
    searchQuery.trim().length >= 2 ? catalogHits ?? matchedBusinesses : businesses;

  const shownIdsRef = useRef<Set<string>>(new Set());
  const pinBusinesses = useMemo(() => {
    const withCoords = visibleMatches.filter(hasMapPinCoords);
    if (searchQuery.trim().length >= 2) return withCoords;
    const next = filterBusinessesForViewport(
      withCoords,
      viewBounds,
      undefined,
      shownIdsRef.current
    );
    const selectedPin =
      selected && hasMapPinCoords(selected) && !next.some((item) => item.id === selected.id)
        ? [...next, selected]
        : next;
    shownIdsRef.current = new Set(selectedPin.map((item) => item.id));
    return selectedPin;
  }, [searchQuery, selected, viewBounds, visibleMatches]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return;
    const pending = visibleMatches.filter((item) => item.pendingGeocode && item.address.trim());
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const item of pending) {
        const geo = await geocodeAddressCached(item.address);
        if (cancelled || !geo) continue;
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === item.id
              ? {
                  ...business,
                  latitude: geo.lat,
                  longitude: geo.lng,
                  pendingGeocode: false,
                  distanceKm: userCoords
                    ? haversineKm(userCoords.lat, userCoords.lng, geo.lat, geo.lng)
                    : business.distanceKm,
                }
              : business
          )
        );
        setCatalogHits((prev) =>
          prev
            ? prev.map((business) =>
                business.id === item.id
                  ? {
                      ...business,
                      latitude: geo.lat,
                      longitude: geo.lng,
                      pendingGeocode: false,
                    }
                  : business
              )
            : prev
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visibleMatches, searchQuery, userCoords]);

  useEffect(() => {
    warmMapPinImages(visibleMatches.map((b) => b.imageUri), 40);
  }, [visibleMatches]);

  const pins: MapLibrePin[] = useMemo(
    () =>
      pinBusinesses.map((b) => ({
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        title: b.name,
        imageUri: b.imageUri,
        selected: b.id === selectedId,
        hasEvent: Boolean(b.hasEvent),
        hasOffer: Boolean(b.hasOffer),
        color: getCategoryAccentForItem(b),
      })),
    [pinBusinesses, selectedId]
  );

  const searchFitCoordinates = useMemo(() => {
    if (searchQuery.trim().length < 2 || searchingCatalog || pins.length === 0) {
      return null;
    }
    return pins.map((pin) => ({
      latitude: pin.latitude,
      longitude: pin.longitude,
    }));
  }, [pins, searchQuery, searchingCatalog]);

  const clearSelection = useCallback(() => {
    routeRequestRef.current += 1;
    setSelectedId(null);
    setRoutes(null);
    setRouteLoading(false);
  }, []);

  const openCompany = useCallback(
    (company: MapBusiness) => {
      router.push({
        pathname: COMPANY_DETAIL_PATH,
        params: {
          returnTo: 'naradig',
          id: company.id,
          claimBusinessId: company.id,
          title: company.name,
          deal: '1',
          imageUri: company.imageUri ?? '',
          Adress: company.address,
          latitude: String(company.latitude),
          longitude: String(company.longitude),
          kortbeskrivning: company.description ?? '',
          långbeskrivning: company.description ?? '',
          mapResetNonce: `${Date.now()}-${Math.random()}`,
        },
      });
    },
    [router]
  );

  return (
    <WebStackSwipeContainer>
      <View style={[styles.root, { backgroundColor: shellBg }]}>
        <StackScreenTabBarSync />
        <BusinessMapSearchHeader value={searchQuery} onChangeText={setSearchQuery} />

        <MapLibreMapView
          key={`explore-${MAP_PAINT_VERSION}-${mode}`}
          center={mapCenter}
          zoom={mapZoom}
          pins={pins}
          fitPins={false}
          fitCoordinates={nearYouFitCoordinates}
          forceFitCoordinates={searchFitCoordinates}
          interactive
          showUserLocation={
            userCoords
              ? { latitude: userCoords.lat, longitude: userCoords.lng }
              : null
          }
          routeLine={drivingLine}
          walkingRouteLine={walkingLine}
          onPinPress={setSelectedId}
          onViewportChange={setViewBounds}
          style={StyleSheet.absoluteFillObject}
        />

        {selected && userCoords && (routeLoading || routes?.driving || routes?.walking) ? (
          <View
            pointerEvents="none"
            style={[styles.routeChips, { top: insets.top + 64 }]}
          >
            {routeLoading ? (
              <View
                style={[
                  styles.routeChipShell,
                  { backgroundColor: theme.cardBg },
                ]}
              >
                <ActivityIndicator size="small" color={theme.text} />
              </View>
            ) : (
              <>
                {routes?.driving ? (
                  <RouteChip
                    route={routes.driving}
                    backgroundColor={theme.cardBg}
                    color={theme.isDark ? '#ffffff' : theme.text}
                  />
                ) : null}
                {routes?.walking ? (
                  <RouteChip
                    route={routes.walking}
                    backgroundColor={theme.cardBg}
                    color={theme.isDark ? '#ffffff' : theme.text}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {!pinsLoading && !searchingCatalog && pins.length === 0 ? (
          <View style={[styles.emptyBanner, { bottom: bottomPad + 16 }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>
              {searchQuery.trim()
                ? 'Inga företag matchar sökningen.'
                : 'Inga företag med plats att visa just nu.'}
            </Text>
          </View>
        ) : null}

        {selected ? (
          <View
            style={[
              styles.card,
              {
                bottom: bottomPad + 12,
                backgroundColor: theme.cardBg,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avmarkera företag"
              onPress={clearSelection}
              hitSlop={8}
              style={[
                styles.deselectButton,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(0,0,0,0.06)',
                },
              ]}
            >
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Öppna ${selected.name}`}
              onPress={() => openCompany(selected)}
              style={styles.cardPressable}
            >
              {selected.imageUri ? (
                <Image source={{ uri: selected.imageUri }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, { backgroundColor: theme.border }]} />
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {selected.name}
                </Text>
                {selected.address ? (
                  <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={2}>
                    {selected.address}
                  </Text>
                ) : null}
                <Text style={[styles.cardCta, { color: OFFERS_CATEGORY_ACCENT }]}>
                  Visa företag
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    </WebStackSwipeContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  routeChips: {
    position: 'absolute',
    left: 16,
    zIndex: 25,
    gap: 8,
    alignItems: 'flex-start',
  },
  routeChipShell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  emptyBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(14,19,37,0.88)',
    zIndex: 20,
  },
  attribution: {
    position: 'absolute',
    right: 10,
    zIndex: 20,
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  attributionDark: {
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(14,19,37,0.75)',
  },
  attributionLight: {
    color: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  deselectButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 28,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardCta: { marginTop: 4, fontSize: 13, fontWeight: '600' },
});
