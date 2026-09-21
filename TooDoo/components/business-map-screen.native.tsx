import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
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
import { getCategoryAccentColor } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getUserCoords, type Coords } from '@/lib/geo';
import { MAP_ATTRIBUTION, mapShellBackground, mapTileUrlForMode } from '@/lib/map-style';
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
  const [viewBounds, setViewBounds] = useState<MapViewBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));
  const tileUrl = mapTileUrlForMode(mode);
  const shellBg = mapShellBackground(mode);

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

  // Businesses load once; markers swap in and out as the viewport moves.
  // Previously shown pins keep their slot while in view (less marker churn).
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
    shownIdsRef.current = new Set(next.map((b) => b.id));
    return next;
  }, [matchedBusinesses, viewBounds]);

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

  const bottomPad = getFloatingTabBarScrollPadding(insets.bottom);

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
                onCalloutPress={() => openCompany(company)}
                onPress={() => openCompany(company)}
              >
                <BusinessMapPin
                  color={color}
                  title={company.name}
                  imageUri={company.imageUri}
                  hasEvent={Boolean(company.hasEvent)}
                  hasOffer={Boolean(company.hasOffer)}
                />
              </Marker>
            );
          })}
        </MapView>

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
      </View>
    </WebStackSwipeContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
});
