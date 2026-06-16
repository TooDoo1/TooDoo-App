import { memo, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { WebView } from 'react-native-webview';

import { buildGoogleMapsEmbedUrl } from './offer-map-url';
import type { OfferMapProps } from './offer-map.types';
import { useDeferUntilVisible } from '@/hooks/use-defer-until-visible';

export type { OfferMapProps };

function OfferMapComponent({
  mapKey,
  latitude,
  longitude,
  title,
  addressText,
}: OfferMapProps) {
  const { ref, shouldLoad } = useDeferUntilVisible();
  const embedSrc = useMemo(
    () =>
      buildGoogleMapsEmbedUrl(
        { latitude, longitude },
        addressText
      ),
    [addressText, latitude, longitude]
  );

  const hasAddress = Boolean(addressText?.trim());

  if (hasAddress && embedSrc) {
    return (
      <View ref={ref} key={mapKey} style={styles.embedShell}>
        {shouldLoad ? (
          <WebView
            source={{ uri: embedSrc }}
            style={styles.embed}
            scrollEnabled={false}
            nestedScrollEnabled
            originWhitelist={['https://*']}
          />
        ) : (
          <ActivityIndicator style={styles.embed} />
        )}
      </View>
    );
  }

  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!hasCoords) {
    return null;
  }

  return (
    <MapView
      key={mapKey}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={styles.embed}
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

export const OfferMap = memo(OfferMapComponent);

const styles = StyleSheet.create({
  embedShell: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e8ecf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embed: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e8ecf4',
  },
});
