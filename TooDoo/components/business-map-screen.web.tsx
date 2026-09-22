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
  type MapViewportBounds,
} from '@/components/ui/maplibre-map.web';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  filterBusinessesByQuery,
  filterBusinessesForViewport,
  loadMapBusinesses,
  MAP_DEFAULT_CENTER,
  peekCachedMapBusinesses,
  type MapBusiness,
} from '@/lib/business-map-data';
import { getCategoryAccentColor, OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getEffectiveUserCoords, type Coords } from '@/lib/geo';
import { MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { mapShellBackground } from '@/lib/map-style';
import {
  fetchTravelRoutes,
  formatRouteSummary,
  type DrivingRoute,
  type TravelRoutes,
} from '@/lib/osrm-route';
import { uiTheme } from '@/lib/ui-theme';

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
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
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  const bottomPad = getFloatingTabBarScrollPadding(insets.bottom);

  const [pinsLoading, setPinsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>(() =>
    peekCachedMapBusinesses()
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<MapViewportBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const coords = await getEffectiveUserCoords().catch(() => null);
      if (cancelled) return;
      setUserCoords(coords);
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

  const selected = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? null,
    [businesses, selectedId]
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

  // Businesses load once; pins swap in and out as the viewport moves.
  // Previously shown pins keep their slot while in view (less marker churn).
  const shownIdsRef = useRef<Set<string>>(new Set());
  const visibleBusinesses = useMemo(() => {
    const next = filterBusinessesForViewport(
      matchedBusinesses,
      viewBounds,
      undefined,
      shownIdsRef.current
    );
    // Keep the selected pin visible even if it's outside the current top-10.
    const withSelected =
      selected && !next.some((b) => b.id === selected.id)
        ? [...next, selected]
        : next;
    shownIdsRef.current = new Set(withSelected.map((b) => b.id));
    return withSelected;
  }, [matchedBusinesses, selected, viewBounds]);

  const pins: MapLibrePin[] = useMemo(
    () =>
      visibleBusinesses.map((b) => ({
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        title: b.name,
        imageUri: b.imageUri,
        selected: b.id === selectedId,
        hasEvent: Boolean(b.hasEvent),
        hasOffer: Boolean(b.hasOffer),
        color: getCategoryAccentColor(b.categoryName),
      })),
    [visibleBusinesses, selectedId]
  );

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
          key={`explore-${MAP_PAINT_VERSION}`}
          center={HELSINGBORG}
          zoom={12.6}
          pins={pins}
          fitPins={false}
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
