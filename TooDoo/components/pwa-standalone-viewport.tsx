import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useStandalonePwa } from '@/lib/use-standalone-pwa';

const APP_BG = '#0e1325';

/** Locks html/body/#root to the full screen in iOS home-screen PWA mode. */
export function PwaStandaloneViewport() {
  const standalone = useStandalonePwa();

  useEffect(() => {
    if (Platform.OS !== 'web' || !standalone) return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const apply = () => {
      html.classList.add('standalone-pwa');
      html.style.setProperty('--app-height', '100vh');
      html.style.backgroundColor = APP_BG;
      body.style.backgroundColor = APP_BG;
      if (root) {
        root.style.backgroundColor = APP_BG;
      }
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [standalone]);

  return null;
}
