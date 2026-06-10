import { Platform } from 'react-native';

/** Remove Safari/Chrome focus rings left on Pressables after stack navigation. */
export function blurActiveElementOnWeb() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
