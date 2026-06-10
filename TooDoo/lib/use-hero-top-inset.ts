import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function readWebSafeAreaTop(): number {
  if (typeof document === 'undefined') return 0;

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;padding-top:constant(safe-area-inset-top);padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.body.removeChild(probe);
  return top;
}

/** Top inset for full-bleed hero — web/PWA often reports 0 without viewport-fit=cover. */
export function useHeroTopInset(): number {
  const insets = useSafeAreaInsets();
  const [webTop, setWebTop] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const update = () => setWebTop(readWebSafeAreaTop());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (Platform.OS === 'web') {
    return Math.max(insets.top, webTop);
  }

  return insets.top;
}
