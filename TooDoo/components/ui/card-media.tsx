import React, { useMemo } from 'react';
import { ImageSourcePropType, Platform, StyleSheet, View } from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

import { sizedImageUrl } from '@/lib/image-url';

const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a2238',
  },
});

function isSvgUrl(uri: string) {
  return /\.svg(\?.*)?$/i.test(uri);
}

function extractUri(source: ImageSourcePropType): string | undefined {
  if (typeof source === 'object' && source && 'uri' in source && typeof (source as { uri?: unknown }).uri === 'string') {
    return String((source as { uri: string }).uri);
  }
  return undefined;
}

type CardMediaProps = {
  source: ImageSourcePropType;
  rasterResizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  svgFit?: 'contain' | 'cover' | 'fill';
  /** Higher priority for above-the-fold hero images. */
  priority?: 'low' | 'normal' | 'high';
  /** Request a CDN variant matched to on-screen width (e.g. 168 for list cards). */
  displayWidth?: number;
};

function CardMediaComponent({
  source,
  rasterResizeMode = 'cover',
  svgFit = 'fill',
  priority = 'normal',
  displayWidth,
}: CardMediaProps) {
  const uri = extractUri(source);
  const isSvg = Boolean(uri && isSvgUrl(uri));

  const resolvedSource = useMemo((): ImageSourcePropType => {
    if (!uri || isSvg || !displayWidth) {
      return source;
    }
    const sized = sizedImageUrl(uri, displayWidth);
    return sized && sized !== uri ? { uri: sized } : source;
  }, [source, uri, isSvg, displayWidth]);

  const resolvedUri = extractUri(resolvedSource) ?? uri;

  const contentFit: ImageContentFit = useMemo(() => {
    if (isSvg) {
      if (svgFit === 'fill') return 'fill';
      if (svgFit === 'cover') return 'cover';
      return 'contain';
    }
    if (rasterResizeMode === 'stretch') return 'fill';
    if (rasterResizeMode === 'cover') return 'cover';
    if (rasterResizeMode === 'center') return 'none';
    return rasterResizeMode;
  }, [isSvg, svgFit, rasterResizeMode]);

  return (
    <View style={styles.container}>
      <ExpoImage
        source={resolvedSource}
        recyclingKey={resolvedUri}
        contentFit={contentFit}
        style={styles.container}
        contentPosition="top center"
        cachePolicy={Platform.OS === 'web' ? 'disk' : 'memory-disk'}
        priority={priority}
        allowDownscaling
        transition={Platform.OS === 'web' || isSvg ? 0 : 120}
        placeholder={Platform.OS === 'web' ? undefined : { blurhash: PLACEHOLDER_BLURHASH }}
      />
    </View>
  );
}

function cardMediaPropsAreEqual(prev: CardMediaProps, next: CardMediaProps) {
  return (
    extractUri(prev.source) === extractUri(next.source) &&
    prev.rasterResizeMode === next.rasterResizeMode &&
    prev.svgFit === next.svgFit &&
    prev.priority === next.priority &&
    prev.displayWidth === next.displayWidth
  );
}

export const CardMedia = React.memo(CardMediaComponent, cardMediaPropsAreEqual);
