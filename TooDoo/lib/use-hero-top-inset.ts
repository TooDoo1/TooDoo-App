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

function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ can report as Macintosh — treat touch Macs as iOS web too.
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return (
    /Macintosh/.test(ua) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document
  );
}

/**
 * Only invent an iOS notch inset in standalone PWA when CSS env() is missing.
 * Browser tabs / desktop RDM often spoof an iPhone UA with env=0 — forcing 47–59
 * there leaves a black gap above the hero.
 */
function standaloneTopFallback(): number {
  if (!isStandaloneWebApp() || !isIosWeb()) return 0;
  if (typeof window === 'undefined') return 47;
  const shortSide = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  const longSide = Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0);
  if (longSide >= 852 || shortSide >= 390) return 59;
  if (longSide >= 812) return 47;
  return 47;
}

function resolveWebTopInset(): number {
  return Math.max(readWebSafeAreaTop(), standaloneTopFallback());
}

/** Top inset for full-bleed hero — prefer measured env(safe-area), else standalone fallback. */
export function useHeroTopInset(): number {
  const insets = useSafeAreaInsets();
  const [webTop, setWebTop] = useState(() =>
    Platform.OS === 'web' ? resolveWebTopInset() : 0
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const update = () => {
      setWebTop(resolveWebTopInset());
    };

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
    return Math.max(insets.top, webTop);
  }

  return insets.top;
}
