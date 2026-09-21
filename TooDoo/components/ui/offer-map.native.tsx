import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { BusinessMapPin } from './business-map-pin';
import { UserLocationArrow } from './user-location-arrow';
import type { OfferMapProps } from './offer-map.types';
import { useThemePreference } from '@/context/theme-preference-context';
import { getCategoryAccentColor } from '@/lib/category-colors';
import { MAP_ATTRIBUTION, mapShellBackground, mapTileUrlForMode } from '@/lib/map-style';
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
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const chipBg = chipBackgroundColor ?? theme.cardBg;
  const chipFg = theme.isDark ? '#ffffff' : theme.text;
  const shellBg = mapShellBackground(mode);
  const tileUrl = mapTileUrlForMode(mode);
  const pinColor = getCategoryAccentColor(categoryName);
  const hasCoords =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);
  const hasOrigin =
    Number.isFinite(originLatitude) && Number.isFinite(originLongitude);

  const [routes, setRoutes] = useState<TravelRoutes | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hasOrigin || !hasCoords) {
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
  }, [hasCoords, hasOrigin, latitude, longitude, originLatitude, originLongitude]);

  const region = useMemo(
    () => ({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
    [latitude, longitude]
  );

  const drivingLine = routes?.driving?.coordinates ?? null;
  const walkingLine = routes?.walking?.coordinates ?? null;
  const hasAnyRoute = Boolean(routes?.driving || routes?.walking);

  if (!hasCoords) {
    return null;
  }

  return (
    <View style={[styles.shell, { backgroundColor: shellBg }]}>
      <MapView
        key={`${mapKey}-${mode}-${drivingLine || walkingLine ? 'r' : 'p'}`}
        style={[styles.map, { backgroundColor: shellBg }]}
        initialRegion={region}
        mapType="none"
        scrollEnabled
        zoomEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
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
        {hasOrigin ? (
          <Marker
            coordinate={{
              latitude: originLatitude as number,
              longitude: originLongitude as number,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <UserLocationArrow />
          </Marker>
        ) : null}
        <Marker
          coordinate={{ latitude, longitude }}
          title={title}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={Boolean(imageUri)}
        >
          <BusinessMapPin
            color={pinColor}
            title={title}
            imageUri={imageUri}
            hasEvent={Boolean(hasEvent)}
            hasOffer={Boolean(hasOffer)}
          />
        </Marker>
      </MapView>
      <Text
        style={[
          styles.attribution,
          mode === 'dark' ? styles.attributionDark : styles.attributionLight,
        ]}
      >
        {MAP_ATTRIBUTION}
      </Text>

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
  shell: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  attribution: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  attributionDark: {
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(14,19,37,0.75)',
  },
  attributionLight: {
    color: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
});
