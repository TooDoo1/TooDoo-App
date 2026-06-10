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

function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function iosWebTopFallback(): number {
  // Mobile Safari often reports env(safe-area-inset-top) as 0 until layout settles.
  if (!isIosWeb()) return 0;
  return 47;
}

function standaloneTopFallback(): number {
  if (!isStandaloneWebApp()) return 0;
  // iOS home-screen apps often report 0 until env() is readable; notch phones ≈ 47–59pt.
  return 47;
}

/** Top inset for full-bleed hero — web/PWA often reports 0 without viewport-fit=cover. */
export function useHeroTopInset(): number {
  const insets = useSafeAreaInsets();
  const [webTop, setWebTop] = useState(() =>
    Platform.OS === 'web'
      ? Math.max(readWebSafeAreaTop(), standaloneTopFallback(), iosWebTopFallback())
      : 0
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const update = () => {
      setWebTop(Math.max(readWebSafeAreaTop(), standaloneTopFallback(), iosWebTopFallback()));
    };

    update();
    const timers = [100, 400, 1000].map((ms) => setTimeout(update, ms));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (Platform.OS === 'web') {
    return Math.max(insets.top, webTop, standaloneTopFallback(), iosWebTopFallback());
  }

  return insets.top;
}
