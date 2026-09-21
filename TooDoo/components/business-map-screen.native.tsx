import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { BusinessMapPin } from '@/components/ui/business-map-pin';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  loadMapBusinesses,
  type MapBusiness,
} from '@/lib/business-map-data';
import { getCategoryAccentColor } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getUserCoords, type Coords } from '@/lib/geo';
import { MAP_ATTRIBUTION, mapShellBackground, mapTileUrlForMode } from '@/lib/map-style';
import { uiTheme } from '@/lib/ui-theme';

const DEFAULT_DELTA = 0.06;

function regionAround(coords: Coords, delta = DEFAULT_DELTA): Region {
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export default function BusinessMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapRef = useRef<MapView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>([]);
  const tileUrl = mapTileUrlForMode(mode);
  const shellBg = mapShellBackground(mode);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const coords = await getUserCoords().catch(() => null);
      if (!cancelled) setUserCoords(coords);
      try {
        const mapped = await loadMapBusinesses(coords);
        if (!cancelled) setBusinesses(mapped);
      } catch {
        if (!cancelled) setBusinesses([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (businesses.length === 0 || !mapRef.current) return;
    const coordinates = businesses.map((b) => ({
      latitude: b.latitude,
      longitude: b.longitude,
    }));
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 80, right: 40, bottom: 100, left: 40 },
        animated: true,
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [businesses]);

  const initialRegion = useMemo(() => {
    if (userCoords) return regionAround(userCoords);
    if (businesses[0]) {
      return regionAround(
        { lat: businesses[0].latitude, lng: businesses[0].longitude },
        0.08
      );
    }
    return regionAround({ lat: 56.0465, lng: 12.6945 }, 0.12);
  }, [businesses, userCoords]);

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
        <ScreenBackButton />

        <View pointerEvents="none" style={[styles.titleWrap, { top: insets.top + 10 }]}>
          <Text style={[styles.title, { color: theme.text }]}>Karta</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Företag nära dig
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={[StyleSheet.absoluteFill, { backgroundColor: shellBg }]}
            initialRegion={initialRegion}
            mapType="none"
            showsUserLocation={Boolean(userCoords)}
            showsMyLocationButton={Platform.OS === 'android'}
            mapPadding={{ top: insets.top + 56, right: 0, bottom: bottomPad, left: 0 }}
          >
            <UrlTile urlTemplate={tileUrl} maximumZ={19} flipY={false} />
            {businesses.map((company) => {
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
                  tracksViewChanges={Boolean(company.imageUri)}
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
        )}

        {!isLoading ? (
          <Text
            style={[
              styles.attribution,
              mode === 'dark' ? styles.attributionDark : styles.attributionLight,
              { bottom: bottomPad + 8 },
            ]}
          >
            {MAP_ATTRIBUTION}
          </Text>
        ) : null}

        {!isLoading && businesses.length === 0 ? (
          <View style={[styles.emptyBanner, { bottom: bottomPad + 16 }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>
              Inga företag med plats att visa just nu.
            </Text>
          </View>
        ) : null}
      </View>
    </WebStackSwipeContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrap: {
    position: 'absolute',
    left: 64,
    right: 24,
    zIndex: 20,
  },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { marginTop: 2, fontSize: 13 },
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
