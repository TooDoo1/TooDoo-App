import React from 'react';
import { ImageSourcePropType, View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

function isSvgUrl(uri: string) {
  return /\.svg(\?.*)?$/i.test(uri);
}

export function CardMedia({
  source,
  rasterResizeMode = 'cover',
  svgFit = 'fill',
}: {
  source: ImageSourcePropType;
  rasterResizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  svgFit?: 'contain' | 'cover' | 'fill';
}) {
  const uri =
    typeof source === 'object' && source && 'uri' in source && typeof (source as any).uri === 'string'
      ? String((source as any).uri)
      : undefined;

  const isSvg = uri && isSvgUrl(uri);
  const contentFit = isSvg
    ? (svgFit === 'fill' ? 'fill' : svgFit === 'cover' ? 'cover' : 'contain')
    : (rasterResizeMode === 'stretch' ? 'fill' : rasterResizeMode === 'cover' ? 'cover' : rasterResizeMode === 'center' ? 'none' : rasterResizeMode);

  return (
    <View style={styles.container}>
      <ExpoImage 
        source={source}
        contentFit={contentFit}
        style={styles.container}
        contentPosition="top center"
        cachePolicy="none"
      />
    </View>
  );
}

