import { Dimensions, Platform } from 'react-native';

export const NARA_DIG_PATH = '/nara-dig' as const;
export const HETA_ERBJUDANDEN_PATH = '/heta-erbjudanden' as const;
export const SLUTAR_SNART_PATH = '/slutar-snart' as const;
export const EVENEMANG_PATH = '/evenemang' as const;
export const SEARCH_RESULTS_PATH = '/sokresultat' as const;

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
  'evenemang',
  'sokresultat',
] as const;

export type FullScreenStackSegment = (typeof FULL_SCREEN_STACK_SEGMENTS)[number];

export function isFullScreenStackRouteName(routeName: string | undefined): routeName is FullScreenStackSegment {
  if (!routeName) return false;
  return FULL_SCREEN_STACK_SEGMENTS.includes(routeName as FullScreenStackSegment);
}

/** Tab bar should only animate in when the screen revealed by a pop is the tab root. */
export function shouldRevealTabBarWhenClosingStack(previousRouteName: string | undefined) {
  if (!previousRouteName || previousRouteName === '(tabs)') {
    return true;
  }
  return !isFullScreenStackRouteName(previousRouteName);
}

const DETAIL_RETURN_TO_LIST_KEYS = new Set(['naradig', 'heta', 'slutarsnart', 'evenemang']);

/** For web swipe-back outside the stack tree — infer destination from segment + returnTo. */
export function shouldRevealTabBarOnStackSwipeBack(
  topSegment: string | undefined,
  returnTo: string | string[] | undefined
) {
  if (topSegment === 'company-detail') {
    const key = Array.isArray(returnTo) ? returnTo[0] : returnTo;
    if (key && DETAIL_RETURN_TO_LIST_KEYS.has(key)) {
      return false;
    }
    return true;
  }

  if (topSegment && isFullScreenStackRouteName(topSegment)) {
    return true;
  }

  return true;
}
