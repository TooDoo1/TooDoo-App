import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { useStandalonePwa } from '@/lib/use-standalone-pwa';

/** Locks html/body/#root to the full screen in iOS home-screen PWA mode. */
export function PwaStandaloneViewport() {
  const standalone = useStandalonePwa();
  const { mode } = useThemePreference();
  const appBg = uiTheme(mode).screenBg;

  useEffect(() => {
    if (Platform.OS !== 'web' || !standalone) return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const apply = () => {
      html.classList.add('standalone-pwa');
      html.style.setProperty('--app-height', '100vh');
      html.style.backgroundColor = appBg;
      body.style.backgroundColor = appBg;
      if (root) {
        root.style.backgroundColor = appBg;
      }
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [appBg, standalone]);

  return null;
}
