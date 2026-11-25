import { Platform, Pressable as RNPressable } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { cssInterop } from 'nativewind';

/**
 * Touch handling for hot paths (feed cards, tab bar, back button, filters).
 *
 * On native this is the react-native-gesture-handler Pressable: touches are recognised
 * on the native side, so a busy JS thread delays only the handler, not touch detection.
 * Reanimated's Android fast-props path (ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS) also
 * recommends it over the built-in Pressable. On web it is the plain RN Pressable.
 *
 * Do not use inside a React Native <Modal> (needs its own GestureHandlerRootView).
 */
if (Platform.OS !== 'web') {
  cssInterop(GesturePressable, { className: 'style' });
}

export const FastPressable = (
  Platform.OS === 'web' ? RNPressable : GesturePressable
) as typeof RNPressable;
