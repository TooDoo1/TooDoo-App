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
}: OfferMapProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  const embedHtml = useMemo(() => {
    const embedSrc = buildGoogleMapsEmbedUrl(
      { latitude, longitude },
      addressText
    );
    return embedSrc ? buildGoogleMapsEmbedHtml(embedSrc) : null;
  }, [addressText, latitude, longitude]);

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
