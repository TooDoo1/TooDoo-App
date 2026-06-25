import { memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildGoogleMapsEmbedHtml, buildGoogleMapsEmbedUrl } from './offer-map-url';
import type { OfferMapProps } from './offer-map.types';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export type { OfferMapProps };

function OfferMapComponent({
  mapKey,
  latitude,
  longitude,
  title,
  addressText,
  originLatitude,
  originLongitude,
}: OfferMapProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  const embedHtml = useMemo(() => {
    const origin =
      Number.isFinite(originLatitude) && Number.isFinite(originLongitude)
        ? { latitude: originLatitude, longitude: originLongitude }
        : null;
    const embedSrc = buildGoogleMapsEmbedUrl({ latitude, longitude }, addressText, origin);
    return embedSrc ? buildGoogleMapsEmbedHtml(embedSrc) : null;
  }, [addressText, latitude, longitude, originLatitude, originLongitude]);

  if (!embedHtml) {
    return null;
  }

  return (
    <View key={mapKey} style={styles.shell}>
      <WebView
        source={{ html: embedHtml, baseUrl: 'https://maps.google.com' }}
        style={styles.map}
        scrollEnabled={false}
        nestedScrollEnabled
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        )}
      />
    </View>
  );
}

export const OfferMap = memo(OfferMapComponent);

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e8ecf4',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    backgroundColor: '#e8ecf4',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8ecf4',
  },
});
