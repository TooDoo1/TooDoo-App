import { Image, ImageSourcePropType, Platform } from 'react-native';

export type HeroSlide = {
  source: ImageSourcePropType;
  title: string;
};

const nativeHeroSlides: HeroSlide[] = [
  {
    source: require('../assets/images/TooDoo.jpg'),
    title: 'Vad vill ni göra idag?',
  },
  {
    source: require('../assets/images/image.png'),
    title: 'Registrera dig idag och ta del av erbjudanden',
  },
  {
    source: require('../assets/images/image(1).png'),
    title: 'Upptäck restauranger och upplevelser nära dig',
  },
];

const webHeroSlides: HeroSlide[] = [
  {
    source: { uri: '/hero/toodoo.jpg' },
    title: 'Vad vill ni göra idag?',
  },
  {
    source: { uri: '/hero/image.png' },
    title: 'Registrera dig idag och ta del av erbjudanden',
  },
  {
    source: { uri: '/hero/image-1.png' },
    title: 'Upptäck restauranger och upplevelser nära dig',
  },
];

export const heroSlides: HeroSlide[] = Platform.OS === 'web' ? webHeroSlides : nativeHeroSlides;

export function resolveHeroImageUri(source: ImageSourcePropType): string | undefined {
  if (typeof source === 'object' && source && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }
  const resolved = Image.resolveAssetSource(source);
  return resolved?.uri;
}
