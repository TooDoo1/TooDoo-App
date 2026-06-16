import { createElement, memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { buildGoogleMapsEmbedUrl } from './offer-map-url';
import type { OfferMapProps } from './offer-map.types';
import { useThemePreference } from '@/context/theme-preference-context';
import { useDeferUntilVisible } from '@/hooks/use-defer-until-visible';
import { uiTheme } from '@/lib/ui-theme';

export type { OfferMapProps };

function OfferMapComponent({
  mapKey,
  latitude,
  longitude,
  title,
  addressText,
}: OfferMapProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapHeight = Math.max(240, Math.min(windowWidth - 48, 360));
  const { ref, shouldLoad } = useDeferUntilVisible();

  const embedSrc = useMemo(
    () =>
      buildGoogleMapsEmbedUrl(
        { latitude, longitude },
        addressText
      ),
    [addressText, latitude, longitude]
  );

  return (
    <View
      ref={ref}
      key={mapKey}
      style={[styles.container, { height: mapHeight }]}
    >
      {shouldLoad && embedSrc ? (
        createElement('iframe', {
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
        })
      ) : (
        <ActivityIndicator color={theme.text} />
      )}
    </View>
  );
}

export const OfferMap = memo(OfferMapComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#e8ecf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
