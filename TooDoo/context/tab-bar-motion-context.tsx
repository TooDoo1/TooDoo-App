import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type TabBarMotionContextValue = {
  stackHideProgress: SharedValue<number>;
  /** Nested stack screens (e.g. Nära dig → map) must not reveal the bar between pops. */
  acquireStackHide: () => void;
  releaseStackHide: () => void;
  tabBarProps: BottomTabBarProps | null;
  setTabBarProps: (props: BottomTabBarProps | null) => void;
};

const TabBarMotionContext = createContext<TabBarMotionContextValue | null>(null);

export function TabBarMotionProvider({ children }: { children: ReactNode }) {
  const stackHideProgress = useSharedValue(0);
  const stackHideCountRef = useRef(0);
  const [tabBarProps, setTabBarPropsState] = useState<BottomTabBarProps | null>(null);

  const setTabBarProps = useCallback((props: BottomTabBarProps | null) => {
    setTabBarPropsState(props);
  }, []);

  const acquireStackHide = useCallback(() => {
    stackHideCountRef.current += 1;
    stackHideProgress.value = 1;
  }, [stackHideProgress]);

  const releaseStackHide = useCallback(() => {
    stackHideCountRef.current = Math.max(0, stackHideCountRef.current - 1);
    if (stackHideCountRef.current === 0) {
      stackHideProgress.value = 0;
    }
  }, [stackHideProgress]);

  const value = useMemo(
    () => ({
      stackHideProgress,
      acquireStackHide,
      releaseStackHide,
      tabBarProps,
      setTabBarProps,
    }),
    [stackHideProgress, acquireStackHide, releaseStackHide, tabBarProps, setTabBarProps]
  );

  return <TabBarMotionContext.Provider value={value}>{children}</TabBarMotionContext.Provider>;
}

export function useTabBarMotion() {
  const context = useContext(TabBarMotionContext);
  if (!context) {
    throw new Error('useTabBarMotion must be used within TabBarMotionProvider');
  }
  return context;
}
