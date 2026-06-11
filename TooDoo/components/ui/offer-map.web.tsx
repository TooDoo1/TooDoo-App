import { createElement, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

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

  return (
    <View key={mapKey} style={styles.container}>
      {createElement('iframe', {
        title: title ?? 'Karta',
        src: embedSrc,
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        allowFullScreen: true,
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: '#e8ecf4',
  },
});
