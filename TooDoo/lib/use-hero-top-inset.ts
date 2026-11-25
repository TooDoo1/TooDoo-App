import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Top inset for full-bleed hero. */
export function useHeroTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top;
}
