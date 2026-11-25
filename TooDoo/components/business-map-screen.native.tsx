import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusinessMapSearchHeader } from '@/components/ui/business-map-search-header';
import { BusinessMapPin } from '@/components/ui/business-map-pin';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserLocationArrow } from '@/components/ui/user-location-arrow';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
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
import {
  pickBestSearchNameMatch,
  scoreSearchNameMatch,
} from '@/lib/catalog-search';
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
import { loadRegionSelection } from '@/lib/region-selection';
import { googleMapStyleForMode } from '@/lib/google-map-styles';
import { mapShellBackground } from '@/lib/map-style';
import {
  fetchTravelRoutes,
  formatRouteSummary,
  type DrivingRoute,
  type TravelRoutes,
} from '@/lib/osrm-route';
import { uiTheme } from '@/lib/ui-theme';
import { useFocusEffect } from '@react-navigation/native';

const DEFAULT_DELTA = 0.06;
/** Neighborhood frame around the active place — follows location changes. */
const NEAR_YOU_DELTA = 0.038;
/** Only pull the camera toward businesses this close to the user. */
const NEAR_YOU_FIT_RADIUS_KM = 3.5;
const NEAR_YOU_FIT_COUNT = 12;

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function sameCoords(a: Coords | null | undefined, b: Coords | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  // ~100 m — ignore GPS jitter so focus refresh doesn't reload the catalog.
  return Math.abs(a.lat - b.lat) < 0.0009 && Math.abs(a.lng - b.lng) < 0.0009;
}

/**
 * Frame the active place. Prefer a user-centered neighborhood view; only
 * expand to include businesses that are actually nearby (not city-wide).
 */
function nearbyFitCoordinates(
  businesses: MapBusiness[],
  userCoords: Coords | null,
  limit = NEAR_YOU_FIT_COUNT
): Array<{ latitude: number; longitude: number }> | null {
  if (!userCoords) return null;

  const nearby = [...businesses]
    .filter(
      (b) =>
        hasMapPinCoords(b) &&
        typeof b.distanceKm === 'number' &&
        b.distanceKm <= NEAR_YOU_FIT_RADIUS_KM
    )
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, limit);

  // No close businesses → camera stays on the user (handled via center/zoom).
  if (nearby.length === 0) return null;

  return [
    { latitude: userCoords.lat, longitude: userCoords.lng },
    ...nearby.map((b) => ({
      latitude: b.latitude,
      longitude: b.longitude,
    })),
  ];
}

function regionAround(coords: Coords, delta = DEFAULT_DELTA): Region {
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function regionToBounds(region: Region): MapViewBounds {
  return {
    west: region.longitude - region.longitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
    south: region.latitude - region.latitudeDelta / 2,
    north: region.latitude + region.latitudeDelta / 2,
  };
}

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

/** Android Google Maps only snapshots custom views while tracksViewChanges is true. */
const MapBusinessMarker = memo(function MapBusinessMarker({
  company,
  selected,
  onPress,
}: {
  company: MapBusiness;
  selected: boolean;
  onPress: () => void;
}) {
  const [tracks, setTracks] = useState(true);
  const color = getCategoryAccentForItem(company);

  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), Platform.OS === 'android' ? 1400 : 700);
    return () => clearTimeout(timer);
  }, [company.id, company.imageUri, selected]);

  const handleSettled = useCallback(() => {
    setTimeout(() => setTracks(false), 64);
  }, []);

  return (
    <Marker
      coordinate={{
        latitude: company.latitude,
        longitude: company.longitude,
      }}
      title={company.name}
      description={company.address || undefined}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      onPress={onPress}
    >
      <BusinessMapPin
        color={color}
        title={company.name}
        imageUri={company.imageUri}
        selected={selected}
        hasEvent={Boolean(company.hasEvent)}
        hasOffer={Boolean(company.hasOffer)}
        onImageSettled={handleSettled}
      />
    </Marker>
  );
});

export default function BusinessMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string | string[];
    select?: string | string[];
    returnTo?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapRef = useRef<MapView | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>(() =>
    peekCachedMapBusinesses()
  );
  const [pinsLoading, setPinsLoading] = useState(
    () => peekCachedMapBusinesses().length === 0
  );
  const [userCoords, setUserCoords] = useState<Coords | null>(HELSINGBORG_COORDS);
  const incomingSelect = paramString(params.select);
  const [selectedId, setSelectedId] = useState<string | null>(() => incomingSelect || null);
  const [viewBounds, setViewBounds] = useState<MapViewBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));
  const [catalogHits, setCatalogHits] = useState<MapBusiness[] | null>(null);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const incomingQuery = paramString(params.q);
  useEffect(() => {
    if (!incomingQuery) return;
    setSearchQuery((prev) => (prev === incomingQuery ? prev : incomingQuery));
  }, [incomingQuery]);
  useEffect(() => {
    if (!incomingSelect) return;
    setSelectedId((prev) => (prev === incomingSelect ? prev : incomingSelect));
  }, [incomingSelect]);
  const [routes, setRoutes] = useState<TravelRoutes | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeRequestRef = useRef(0);
  const [trackUserPin, setTrackUserPin] = useState(true);
  const shellBg = mapShellBackground(mode);
  const googleMapStyle = googleMapStyleForMode(mode);
  const bottomPad = Math.max(insets.bottom, 12) + 16;

  useEffect(() => {
    setTrackUserPin(true);
    const timer = setTimeout(() => setTrackUserPin(false), 500);
    return () => clearTimeout(timer);
  }, [userCoords?.lat, userCoords?.lng]);
  const fromNaraDig = paramString(params.returnTo) === 'naradig';
  const regionDelta = fromNaraDig ? NEAR_YOU_DELTA : DEFAULT_DELTA;
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
      // Never block the first map paint on a GPS permission dialog.
      const granted = await getEffectiveUserCoordsIfGranted().catch(() => null);
      const seed = granted ?? HELSINGBORG_COORDS;
      if (cancelled) return;
      await refreshForCoords(seed);

      if (granted || cancelled) return;
      const prompted = await getEffectiveUserCoords().catch(() => null);
      if (!cancelled && prompted) await refreshForCoords(prompted);
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

  const initialRegion = useMemo(
    () => regionAround(userCoords ?? MAP_DEFAULT_CENTER, regionDelta),
    [regionDelta, userCoords]
  );

  const nearYouFitCoordinates = useMemo(() => {
    if (!fromNaraDig) return null;
    return nearbyFitCoordinates(businesses, userCoords);
  }, [businesses, fromNaraDig, userCoords]);

  const nearYouFitSigRef = useRef('');

  // Follow the active place: neighborhood around the user, optionally expanded
  // to businesses within NEAR_YOU_FIT_RADIUS_KM (never city-wide).
  useEffect(() => {
    if (!mapRef.current || !fromNaraDig || !userCoords) return;

    if (nearYouFitCoordinates && nearYouFitCoordinates.length >= 2) {
      const sig = nearYouFitCoordinates
        .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
        .join('|');
      if (nearYouFitSigRef.current === sig) return;
      nearYouFitSigRef.current = sig;
      mapRef.current.fitToCoordinates(nearYouFitCoordinates, {
        edgePadding: { top: 110, right: 44, bottom: 48, left: 44 },
        animated: true,
      });
      return;
    }

    const sig = `user:${userCoords.lat.toFixed(5)},${userCoords.lng.toFixed(5)}:${regionDelta}`;
    if (nearYouFitSigRef.current === sig) return;
    nearYouFitSigRef.current = sig;
    mapRef.current.animateToRegion(regionAround(userCoords, regionDelta), 450);
  }, [fromNaraDig, nearYouFitCoordinates, regionDelta, userCoords]);

  const regionEmitAtRef = useRef(0);
  const handleRegionChange = useCallback((region: Region) => {
    setViewBounds(regionToBounds(region));
  }, []);
  const handleRegionChangeLive = useCallback((region: Region) => {
    const now = Date.now();
    if (now - regionEmitAtRef.current < 120) return;
    regionEmitAtRef.current = now;
    setViewBounds(regionToBounds(region));
  }, []);

  const selected = useMemo(
    () =>
      catalogHits?.find((b) => b.id === selectedId) ??
      businesses.find((b) => b.id === selectedId) ??
      null,
    [businesses, catalogHits, selectedId]
  );

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

  const fittedRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current || !routes) {
      fittedRouteKeyRef.current = null;
      return;
    }
    const coords = [
      ...(routes.driving?.coordinates ?? []),
      ...(routes.walking?.coordinates ?? []),
    ];
    if (coords.length === 0) return;
    const key = selectedId ?? '';
    if (fittedRouteKeyRef.current === key) return;
    fittedRouteKeyRef.current = key;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 40, bottom: bottomPad + 140, left: 40 },
      animated: true,
    });
  }, [bottomPad, routes, selectedId]);

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
    const controller = new AbortController();
    setSearchingCatalog(true);
    setCatalogHits(null);
    const timer = setTimeout(() => {
      void loadRegionSelection()
        .catch(() => null)
        .then((region) =>
          searchMapBusinesses(query, businessesRef.current, userCoords, {
            city: region?.city,
            signal: controller.signal,
          })
        )
        .then((hits) => {
          if (cancelled) return;
          setCatalogHits(hits);
          if (hits.length > 0) {
            setBusinesses((prev) => mergeSearchHitsIntoMapBusinesses(prev, hits));
          }
          const firstPin =
            hits.find((hit) => hasMapPinCoords(hit)) ?? hits[0] ?? null;
          const namePreferred =
            pickBestSearchNameMatch(hits, query, (hit) => hit.name) ?? firstPin;

          if (incomingSelect) {
            const selectedHit = hits.find((hit) => hit.id === incomingSelect);
            const selectScore = selectedHit
              ? scoreSearchNameMatch(selectedHit.name, query)
              : 0;
            const nameScore = namePreferred
              ? scoreSearchNameMatch(namePreferred.name, query)
              : 0;
            // Prefer the handed-off id when it matches the query; otherwise the best name hit
            // (fixes distance-sorted wrong selects like a nearer pizza over "Berga Pizza").
            if (selectedHit && (selectScore >= 40 || selectScore >= nameScore)) {
              setSelectedId(selectedHit.id);
            } else if (namePreferred && nameScore > selectScore) {
              setSelectedId(namePreferred.id);
            } else if (selectedHit) {
              setSelectedId(selectedHit.id);
            } else if (businessesRef.current.some((b) => b.id === incomingSelect)) {
              setSelectedId(incomingSelect);
            } else if (namePreferred) {
              setSelectedId(namePreferred.id);
            }
          } else if (namePreferred) {
            setSelectedId(namePreferred.id);
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingCatalog(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [incomingSelect, searchQuery, userCoords]);

  const visibleMatches =
    searchQuery.trim().length >= 2 ? catalogHits ?? matchedBusinesses : businesses;

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

  const shownIdsRef = useRef<Set<string>>(new Set());
  const visibleBusinesses = useMemo(() => {
    if (searchQuery.trim().length >= 2) {
      return visibleMatches.filter(hasMapPinCoords);
    }
    const next = filterBusinessesForViewport(
      matchedBusinesses,
      viewBounds,
      undefined,
      shownIdsRef.current
    );
    const withSelected =
      selected && hasMapPinCoords(selected) && !next.some((b) => b.id === selected.id)
        ? [...next, selected]
        : next;
    shownIdsRef.current = new Set(withSelected.map((b) => b.id));
    return withSelected;
  }, [matchedBusinesses, searchQuery, selected, viewBounds, visibleMatches]);

  const searchFitSigRef = useRef('');
  useEffect(() => {
    if (!mapRef.current) return;
    if (searchQuery.trim().length < 2 || searchingCatalog) {
      searchFitSigRef.current = '';
      return;
    }
    const focus = selectedId
      ? visibleBusinesses.find((item) => item.id === selectedId)
      : null;
    const coords = (focus ? [focus] : visibleBusinesses.slice(0, 8)).map((item) => ({
      latitude: item.latitude,
      longitude: item.longitude,
    }));
    if (coords.length === 0) return;
    const sig = `${selectedId ?? ''}|${coords
      .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
      .join('|')}`;
    if (searchFitSigRef.current === sig) return;
    searchFitSigRef.current = sig;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 110, right: 44, bottom: bottomPad + 160, left: 44 },
      animated: true,
    });
  }, [bottomPad, searchingCatalog, searchQuery, selectedId, visibleBusinesses]);

  const drivingLine = routes?.driving?.coordinates ?? null;
  const walkingLine = routes?.walking?.coordinates ?? null;

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

        <MapView
          ref={mapRef}
          key={`map-${mode}`}
          style={[StyleSheet.absoluteFill, { backgroundColor: shellBg }]}
          initialRegion={initialRegion}
          mapType="standard"
          userInterfaceStyle={mode === 'dark' ? 'dark' : 'light'}
          customMapStyle={googleMapStyle}
          showsUserLocation={false}
          showsMyLocationButton={Platform.OS === 'android'}
          mapPadding={{ top: insets.top + 56, right: 0, bottom: bottomPad, left: 0 }}
          onRegionChange={handleRegionChangeLive}
          onRegionChangeComplete={handleRegionChange}
        >
          {walkingLine?.length ? (
            <Polyline
              coordinates={walkingLine}
              strokeColor="#30d158"
              strokeWidth={4}
              lineDashPattern={[8, 6]}
            />
          ) : null}
          {drivingLine?.length ? (
            <Polyline coordinates={drivingLine} strokeColor="#0a84ff" strokeWidth={4} />
          ) : null}
          {userCoords ? (
            <Marker
              coordinate={{
                latitude: userCoords.lat,
                longitude: userCoords.lng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={trackUserPin}
            >
              <UserLocationArrow />
            </Marker>
          ) : null}
          {visibleBusinesses.map((company) => (
            <MapBusinessMarker
              key={company.id}
              company={company}
              selected={company.id === selectedId}
              onPress={() => setSelectedId(company.id)}
            />
          ))}
        </MapView>

        {selected && userCoords && (routeLoading || routes?.driving || routes?.walking) ? (
          <View pointerEvents="none" style={[styles.routeChips, { top: insets.top + 64 }]}>
            {routeLoading ? (
              <View style={[styles.routeChipShell, { backgroundColor: theme.cardBg }]}>
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

        {pinsLoading || searchingCatalog ? (
          <View style={[styles.emptyBanner, { bottom: bottomPad + 16 }]}>
            <LoadingSpinner
              label={searchingCatalog ? 'Söker...' : 'Laddar kartan...'}
              color={theme.text}
            />
          </View>
        ) : visibleBusinesses.length === 0 ? (
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
