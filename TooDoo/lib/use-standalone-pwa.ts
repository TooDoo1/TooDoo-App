import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { isStandaloneWebApp } from '@/lib/pwa-standalone';

export function useStandalonePwa(): boolean {
  const [standalone, setStandalone] = useState(
    () => Platform.OS === 'web' && isStandaloneWebApp()
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const update = () => setStandalone(isStandaloneWebApp());
    update();

    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return standalone;
}
