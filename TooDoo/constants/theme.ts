/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { BrandColors } from '@/lib/brand-colors';

const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: BrandColors.light.foreground,
    background: BrandColors.light.background,
    tint: BrandColors.light.foreground,
    icon: BrandColors.light.foreground,
    tabIconDefault: BrandColors.light.mutedForeground,
    tabIconSelected: BrandColors.light.foreground,
  },
  dark: {
    text: BrandColors.dark.foreground,
    background: BrandColors.dark.background,
    tint: tintColorDark,
    icon: BrandColors.dark.mutedForeground,
    tabIconDefault: BrandColors.dark.mutedForeground,
    tabIconSelected: tintColorDark,
  },
};
