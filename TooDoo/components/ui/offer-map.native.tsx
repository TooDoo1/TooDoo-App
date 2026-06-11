import { useMemo } from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { WebView } from 'react-native-webview';

import { buildGoogleMapsEmbedUrl } from './offer-map-url';
import type { OfferMapProps } from './offer-map.types';

export type { OfferMapProps };

export function OfferMap({
  mapKey,
  latitude,
  longitude,
  title,
  addressText,
  originCoords,
}: OfferMapProps) {
  const embedSrc = useMemo(
    () =>
      buildGoogleMapsEmbedUrl(
        { latitude, longitude },
        addressText,
        originCoords
      ),
    [addressText, latitude, longitude, originCoords]
  );

  const hasOrigin =
    originCoords &&
    Number.isFinite(originCoords.latitude) &&
    Number.isFinite(originCoords.longitude);
  const hasAddress = Boolean(addressText?.trim());

  if (hasOrigin || hasAddress) {
    return (
      <WebView
        key={mapKey}
        source={{ uri: embedSrc }}
        style={{ width: '100%', aspectRatio: 1, backgroundColor: '#e8ecf4' }}
        scrollEnabled={false}
        nestedScrollEnabled
        originWhitelist={['https://*']}
      />
    );
  }

  return (
    <MapView
      key={mapKey}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={{ width: '100%', aspectRatio: 1 }}
      scrollEnabled
      zoomEnabled
      rotateEnabled
      pitchEnabled
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Marker coordinate={{ latitude, longitude }} title={title ?? 'Erbjudande'} description={addressText} />
    </MapView>
  );
}
