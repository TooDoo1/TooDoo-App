import { Dimensions, Platform } from 'react-native';

export const NARA_DIG_PATH = '/nara-dig' as const;
export const HETA_ERBJUDANDEN_PATH = '/heta-erbjudanden' as const;
export const SLUTAR_SNART_PATH = '/slutar-snart' as const;

/** Swipe-back only registers when the gesture starts within this fraction of the screen width. */
export const SWIPE_BACK_EDGE_FRACTION = 0.1;

export function getSwipeBackGestureResponseDistance(windowWidth?: number) {
  const width = windowWidth ?? Dimensions.get('window').width;
  return {
    end: width * SWIPE_BACK_EDGE_FRACTION,
  };
}

export function getSwipeableStackScreenOptions(windowWidth?: number) {
  if (Platform.OS === 'web') {
    return { headerShown: false, animation: 'default' as const };
  }

  return {
    headerShown: false,
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
    gestureResponseDistance: getSwipeBackGestureResponseDistance(windowWidth),
    animation: 'slide_from_right' as const,
  };
}

export const FULL_SCREEN_STACK_SEGMENTS = [
  'company-detail',
  'nara-dig',
  'heta-erbjudanden',
  'slutar-snart',
] as const;
