import { useEffect, useRef, useState, type RefObject } from 'react';
import { InteractionManager, Platform, type View } from 'react-native';

/** Defer heavy children (e.g. map iframes) until idle and near the viewport. */
export function useDeferUntilVisible(rootMargin = '320px'): {
  ref: RefObject<View>;
  shouldLoad: boolean;
} {
  const ref = useRef<View>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;

    const markReady = () => {
      if (!cancelled) {
        setShouldLoad(true);
      }
    };

    const scheduleReady = () => {
      if (Platform.OS === 'web' && typeof requestIdleCallback === 'function') {
        requestIdleCallback(markReady, { timeout: 1500 });
        return;
      }
      setTimeout(markReady, Platform.OS === 'web' ? 0 : 400);
    };

    const attachObserver = () => {
      if (Platform.OS !== 'web') {
        scheduleReady();
        return;
      }

      const node = ref.current as unknown as Element | null;
      if (!node) {
        scheduleReady();
        return;
      }

      if (typeof IntersectionObserver === 'undefined') {
        scheduleReady();
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            markReady();
            observer?.disconnect();
          }
        },
        { rootMargin, threshold: 0.01 }
      );
      observer.observe(node);
    };

    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        attachObserver();
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
      observer?.disconnect();
    };
  }, [rootMargin]);

  return { ref, shouldLoad };
}
