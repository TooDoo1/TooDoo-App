import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusinessMapSearchHeader } from '@/components/ui/business-map-search-header';
import { BusinessMapPin } from '@/components/ui/business-map-pin';
import { UserLocationArrow } from '@/components/ui/user-location-arrow';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  filterBusinessesByQuery,
  filterBusinessesForViewport,
  loadMapBusinesses,
  MAP_DEFAULT_CENTER,
  peekCachedMapBusinesses,
  type MapBusiness,
  type MapViewBounds,
} from '@/lib/business-map-data';
import { getCategoryAccentColor, OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getUserCoords, type Coords } from '@/lib/geo';
import { MAP_ATTRIBUTION, mapShellBackground, mapTileUrlForMode } from '@/lib/map-style';
import {
  fetchTravelRoutes,
  formatRouteSummary,
  type DrivingRoute,
  type TravelRoutes,
} from '@/lib/osrm-route';
import { uiTheme } from '@/lib/ui-theme';

const DEFAULT_DELTA = 0.06;

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
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

export default function BusinessMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapRef = useRef<MapView | null>(null);
  const [pinsLoading, setPinsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>(() =>
    peekCachedMapBusinesses()
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<MapViewBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));
  const [routes, setRoutes] = useState<TravelRoutes | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const tileUrl = mapTileUrlForMode(mode);
  const shellBg = mapShellBackground(mode);
  const bottomPad = getFloatingTabBarScrollPadding(insets.bottom);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const coords = await getUserCoords().catch(() => null);
      if (!cancelled) setUserCoords(coords);
      try {
        const mapped = await loadMapBusinesses(coords);
        if (!cancelled) setBusinesses(mapped);
      } catch {
        if (!cancelled && businesses.length === 0) setBusinesses([]);
      } finally {
        if (!cancelled) setPinsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount — seed from cache, then refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialRegion = useMemo(
    () => regionAround(MAP_DEFAULT_CENTER, DEFAULT_DELTA),
    []
  );

  const handleRegionChange = useCallback((region: Region) => {
    setViewBounds(regionToBounds(region));
  }, []);

  const selected = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? null,
    [businesses, selectedId]
  );

  useEffect(() => {
    let cancelled = false;
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
      if (!cancelled) {
        setRoutes(result);
        setRouteLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, userCoords]);

  useEffect(() => {
    if (!mapRef.current || !routes) return;
    const coords = [
      ...(routes.driving?.coordinates ?? []),
      ...(routes.walking?.coordinates ?? []),
    ];
    if (coords.length === 0) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 40, bottom: bottomPad + 140, left: 40 },
      animated: true,
    });
  }, [bottomPad, routes]);

  const matchedBusinesses = useMemo(
    () => filterBusinessesByQuery(businesses, searchQuery),
    [businesses, searchQuery]
  );
  const shownIdsRef = useRef<Set<string>>(new Set());
  const visibleBusinesses = useMemo(() => {
    const next = filterBusinessesForViewport(
      matchedBusinesses,
      viewBounds,
      undefined,
      shownIdsRef.current
    );
    const withSelected =
      selected && !next.some((b) => b.id === selected.id)
        ? [...next, selected]
        : next;
    shownIdsRef.current = new Set(withSelected.map((b) => b.id));
    return withSelected;
  }, [matchedBusinesses, selected, viewBounds]);

  const drivingLine = routes?.driving?.coordinates ?? null;
  const walkingLine = routes?.walking?.coordinates ?? null;

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
          style={[StyleSheet.absoluteFill, { backgroundColor: shellBg }]}
          initialRegion={initialRegion}
          mapType="none"
          showsUserLocation={false}
          showsMyLocationButton={Platform.OS === 'android'}
          mapPadding={{ top: insets.top + 56, right: 0, bottom: bottomPad, left: 0 }}
          onRegionChangeComplete={handleRegionChange}
        >
          <UrlTile urlTemplate={tileUrl} maximumZ={19} flipY={false} />
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
              tracksViewChanges={false}
            >
              <UserLocationArrow />
            </Marker>
          ) : null}
          {visibleBusinesses.map((company) => {
            const color = getCategoryAccentColor(company.categoryName);
            return (
              <Marker
                key={company.id}
                coordinate={{
                  latitude: company.latitude,
                  longitude: company.longitude,
                }}
                title={company.name}
                description={company.address || undefined}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                onPress={() => setSelectedId(company.id)}
              >
                <BusinessMapPin
                  color={color}
                  title={company.name}
                  imageUri={company.imageUri}
                  selected={company.id === selectedId}
                  hasEvent={Boolean(company.hasEvent)}
                  hasOffer={Boolean(company.hasOffer)}
                />
              </Marker>
            );
          })}
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

        <Text
          style={[
            styles.attribution,
            mode === 'dark' ? styles.attributionDark : styles.attributionLight,
            { bottom: bottomPad + 8 },
          ]}
        >
          {MAP_ATTRIBUTION}
        </Text>

        {!pinsLoading && matchedBusinesses.length === 0 ? (
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
              onPress={() => setSelectedId(null)}
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
