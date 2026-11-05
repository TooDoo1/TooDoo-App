import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isStandaloneWebApp } from '@/lib/pwa-standalone';

function readWebSafeAreaTop(): number {
  if (typeof document === 'undefined') return 0;

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;height:0;padding-top:constant(safe-area-inset-top);padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.body.removeChild(probe);
  return top;
}

/** True only on real iPhone/iPad Safari (or iPadOS desktop-UA touch). */
export function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return (
    /Macintosh/.test(ua) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document
  );
}

/**
 * Top inset for full-bleed hero.
 * Web: trust env(safe-area-inset-top) / SafeAreaProvider only — never invent
 * 47–59px from screen size (that padded desktop and lied in Firefox device mode).
 * Real iPhone Safari with viewport-fit=cover reports the Dynamic Island correctly.
 */
export function useHeroTopInset(): number {
  const insets = useSafeAreaInsets();
  const [webTop, setWebTop] = useState(() =>
    Platform.OS === 'web' ? readWebSafeAreaTop() : 0
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const update = () => setWebTop(readWebSafeAreaTop());
    update();
    const timers = [50, 100, 400, 1000].map((ms) => setTimeout(update, ms));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (Platform.OS === 'web') {
    // Standalone iOS PWA sometimes reports 0 on first paint — keep a soft floor
    // only when we already measured a positive inset once, or SafeArea did.
    const measured = Math.max(insets.top, webTop);
    if (measured > 0) return measured;
    if (isStandaloneWebApp() && isIosWeb()) return 47;
    return 0;
  }

  return insets.top;
}
