import React from 'react';
import { Image, ImageResizeMode, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

function isSvgUrl(uri: string) {
  return /\.svg(\?.*)?$/i.test(uri);
}

function toRnResizeMode(mode: 'cover' | 'contain' | 'stretch' | 'center'): ImageResizeMode {
  if (mode === 'stretch') return 'stretch';
  if (mode === 'contain') return 'contain';
  if (mode === 'center') return 'center';
  return 'cover';
}

export function CardMedia({
  source,
  rasterResizeMode = 'cover',
  svgFit = 'fill',
  svgContain,
}: {
  source: ImageSourcePropType;
  rasterResizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  svgFit?: 'contain' | 'cover' | 'fill';
  /** When the URI is an SVG, prefer `contain` (matches older call sites). */
  svgContain?: boolean;
}) {
  const uri =
    typeof source === 'object' && source && 'uri' in source && typeof (source as any).uri === 'string'
      ? String((source as any).uri)
      : undefined;

  const effectiveSvgFit = svgContain ? 'contain' : svgFit;
  const isSvg = Boolean(uri && isSvgUrl(uri));

  if (isSvg) {
    const contentFit =
      effectiveSvgFit === 'fill' ? 'fill' : effectiveSvgFit === 'cover' ? 'cover' : 'contain';
    return (
      <View style={styles.container}>
        <ExpoImage
          source={source}
          contentFit={contentFit}
          style={styles.fill}
          cachePolicy="memory-disk"
          transition={0}
        />
      </View>
    );
  }

  // RN `Image` is much cheaper than ExpoImage while parents animate layout every frame (home cards).
  return (
    <View style={styles.container}>
      <Image source={source} style={styles.fill} resizeMode={toRnResizeMode(rasterResizeMode)} />
    </View>
  );
}
