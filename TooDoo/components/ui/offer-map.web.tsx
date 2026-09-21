import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MapLibreMapView } from './maplibre-map.web';
import type { OfferMapProps } from './offer-map.types';
import { useThemePreference } from '@/context/theme-preference-context';
import { getCategoryAccentColor } from '@/lib/category-colors';
import { MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { mapShellBackground } from '@/lib/map-style';
import {
  fetchTravelRoutes,
  formatRouteSummary,
  type DrivingRoute,
  type TravelRoutes,
} from '@/lib/osrm-route';
import { uiTheme } from '@/lib/ui-theme';

export type { OfferMapProps };

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
      pointerEvents="none"
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

function OfferMapComponent({
  mapKey,
  latitude,
  longitude,
  title,
  imageUri,
  categoryName,
  hasEvent,
  hasOffer,
  originLatitude,
  originLongitude,
  chipBackgroundColor,
}: OfferMapProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapHeight = Math.max(240, Math.min(windowWidth - 48, 360));
  const shellBg = mapShellBackground(mode);
  const pinColor = getCategoryAccentColor(categoryName);
  const chipBg = chipBackgroundColor ?? theme.cardBg;
  const chipFg = theme.isDark ? '#ffffff' : theme.text;

  const hasOrigin =
    Number.isFinite(originLatitude) && Number.isFinite(originLongitude);
  const [routes, setRoutes] = useState<TravelRoutes | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hasOrigin) {
      setRoutes(null);
      setRouteLoading(false);
      return;
    }
    setRouteLoading(true);
    void fetchTravelRoutes(
      { lat: originLatitude as number, lng: originLongitude as number },
      { lat: latitude, lng: longitude }
    ).then((result) => {
      if (!cancelled) {
        setRoutes(result);
        setRouteLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasOrigin, latitude, longitude, originLatitude, originLongitude]);

  const pins = useMemo(
    () => [
      {
        id: mapKey,
        latitude,
        longitude,
        color: pinColor,
        title,
        imageUri,
        hasEvent: Boolean(hasEvent),
        hasOffer: Boolean(hasOffer),
      },
    ],
    [hasEvent, hasOffer, imageUri, latitude, longitude, mapKey, pinColor, title]
  );

  const userLocation = hasOrigin
    ? { latitude: originLatitude as number, longitude: originLongitude as number }
    : null;

  const drivingLine = routes?.driving?.coordinates ?? null;
  const walkingLine = routes?.walking?.coordinates ?? null;
  const hasAnyRoute = Boolean(routes?.driving || routes?.walking);

  return (
    <View style={[styles.wrap, { height: mapHeight, backgroundColor: shellBg }]}>
      <MapLibreMapView
        key={`map-${MAP_PAINT_VERSION}-${hasOrigin ? 'route' : 'pin'}`}
        center={{ latitude, longitude }}
        zoom={14.5}
        pins={pins}
        showUserLocation={userLocation}
        routeLine={drivingLine}
        walkingRouteLine={walkingLine}
        interactive
        style={StyleSheet.absoluteFillObject}
      />

      {routeLoading ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            zIndex: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: chipBg,
          }}
        >
          <ActivityIndicator size="small" color={chipFg} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: chipFg }}>
            Hämtar väg…
          </Text>
        </View>
      ) : null}

      {hasAnyRoute && !routeLoading ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            zIndex: 20,
            gap: 6,
          }}
        >
          {routes?.driving ? (
            <RouteChip route={routes.driving} backgroundColor={chipBg} color={chipFg} />
          ) : null}
          {routes?.walking ? (
            <RouteChip route={routes.walking} backgroundColor={chipBg} color={chipFg} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const OfferMap = memo(OfferMapComponent);

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
});
