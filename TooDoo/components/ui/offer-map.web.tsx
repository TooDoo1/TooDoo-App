import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OfferMapProps } from './offer-map.types';

export type { OfferMapProps };

function buildGoogleMapsEmbedUrl(latitude: number, longitude: number, addressText: string) {
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  const query = hasCoords
    ? `${latitude},${longitude}`
    : encodeURIComponent(addressText);

  return `https://maps.google.com/maps?q=${query}&hl=sv&z=15&output=embed`;
}

export function OfferMap({ mapKey, latitude, longitude, title, addressText }: OfferMapProps) {
  const embedSrc = buildGoogleMapsEmbedUrl(latitude, longitude, addressText);

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
    height: 220,
    overflow: 'hidden',
    backgroundColor: '#e8ecf4',
  },
});
