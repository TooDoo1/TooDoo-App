import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

export const DETAIL_SCREEN_MOTION_MS = 560;
/** Shorter on web — long tab-bar tweens felt like a freeze after swipe-back. */
export const WEB_STACK_MOTION_MS = 220;
export const DETAIL_SCREEN_MOTION_EASING = Easing.out(Easing.cubic);

export function getStackMotionMs() {
  return Platform.OS === 'web' ? WEB_STACK_MOTION_MS : DETAIL_SCREEN_MOTION_MS;
}
