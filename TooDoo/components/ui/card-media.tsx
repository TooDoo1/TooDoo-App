import React from 'react';
import { Image, ImageSourcePropType, View } from 'react-native';
import { SvgUri } from 'react-native-svg';

function isSvgUrl(uri: string) {
  return /\.svg(\?.*)?$/i.test(uri);
}

export function CardMedia({
  source,
  rasterResizeMode = 'cover',
  svgContain = true,
}: {
  source: ImageSourcePropType;
  rasterResizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  svgContain?: boolean;
}) {
  const uri =
    typeof source === 'object' && source && 'uri' in source && typeof (source as any).uri === 'string'
      ? String((source as any).uri)
      : undefined;

  if (uri && isSvgUrl(uri)) {
    // Remote SVGs aren't supported by <Image />; render using react-native-svg.
    // For logos, "meet" (contain) looks more natural than cropping.
    const preserveAspectRatio = svgContain ? 'xMidYMid meet' : 'xMidYMid slice';
    return (
      <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <SvgUri uri={uri} width="100%" height="100%" preserveAspectRatio={preserveAspectRatio} />
      </View>
    );
  }

  return <Image source={source} resizeMode={rasterResizeMode} className="h-full w-full" />;
}

