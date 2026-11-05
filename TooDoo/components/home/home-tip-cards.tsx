import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { HOME_PAGE_PAD, HOME_RADIUS } from '@/components/home/home-feed';

/** Static discovery hero height in the home header (fits Upptäck + kommun title). */
export const HOME_TIP_STRIP_HEIGHT = 200;

const HERO_IMAGE = require('../../assets/images/helsingborg-hero.png');

export type HomeTipCard = {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  query: string;
};

const HERO_TIP: HomeTipCard = {
  id: 'helsingborg',
  eyebrow: 'Upptäck',
  title: 'Helsingborg',
  query: 'helsingborg',
};

const NO_OUTLINE =
  Platform.OS === 'web'
    ? ({ outlineWidth: 0, cursor: 'pointer' as const } as const)
    : ({} as const);

/** Static city hero — image background, no horizontal scroller. */
export function HomeTipCards({
  onTipPress,
}: {
  onTipPress?: (tip: HomeTipCard) => void;
}) {
  return (
    <View style={styles.bleed}>
      <Pressable
        onPress={() => onTipPress?.(HERO_TIP)}
        accessibilityRole="button"
        accessibilityLabel={`${HERO_TIP.eyebrow} ${HERO_TIP.title}`}
        style={[styles.hero, NO_OUTLINE]}
      >
        <Image source={HERO_IMAGE} style={styles.image} resizeMode="cover" />
        <LinearGradient
          colors={[
            'rgba(8,12,22,0.18)',
            'rgba(8,12,22,0.22)',
            'rgba(8,12,22,0.82)',
          ]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.copy} pointerEvents="none">
          <Text numberOfLines={1} style={styles.eyebrow}>
            {HERO_TIP.eyebrow}
          </Text>
          <Text numberOfLines={1} style={styles.title}>
            {HERO_TIP.title}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -HOME_PAGE_PAD,
    paddingHorizontal: HOME_PAGE_PAD,
  },
  hero: {
    height: HOME_TIP_STRIP_HEIGHT,
    borderRadius: HOME_RADIUS + 4,
    overflow: 'hidden',
    backgroundColor: '#121826',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  copy: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  title: {
    marginTop: 1,
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.9,
    lineHeight: 34,
  },
});
