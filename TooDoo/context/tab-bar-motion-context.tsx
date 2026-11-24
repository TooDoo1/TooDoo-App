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
  /** 0 = visible, 1 = hidden from scroll-down on tab roots. */
  scrollHideProgress: SharedValue<number>;
  /** Nested stack screens (e.g. Nära dig → map) must not reveal the bar between pops. */
  acquireStackHide: () => void;
  releaseStackHide: () => void;
};

type SetTabBarProps = (props: BottomTabBarProps | null) => void;

/**
 * Tab bar navigation props live in their own contexts: they change on every tab
 * press, and screens that only need the motion shared values must not re-render.
 */
const TabBarMotionContext = createContext<TabBarMotionContextValue | null>(null);
const TabBarPropsContext = createContext<BottomTabBarProps | null>(null);
const SetTabBarPropsContext = createContext<SetTabBarProps | null>(null);

export function TabBarMotionProvider({ children }: { children: ReactNode }) {
  const stackHideProgress = useSharedValue(0);
  const scrollHideProgress = useSharedValue(0);
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
      scrollHideProgress,
      acquireStackHide,
      releaseStackHide,
    }),
    [stackHideProgress, scrollHideProgress, acquireStackHide, releaseStackHide]
  );

  return (
    <TabBarMotionContext.Provider value={value}>
      <SetTabBarPropsContext.Provider value={setTabBarProps}>
        <TabBarPropsContext.Provider value={tabBarProps}>{children}</TabBarPropsContext.Provider>
      </SetTabBarPropsContext.Provider>
    </TabBarMotionContext.Provider>
  );
}

export function useTabBarMotion() {
  const context = useContext(TabBarMotionContext);
  if (!context) {
    throw new Error('useTabBarMotion must be used within TabBarMotionProvider');
  }
  return context;
}

export function useTabBarProps() {
  return useContext(TabBarPropsContext);
}

export function useSetTabBarProps() {
  const setter = useContext(SetTabBarPropsContext);
  if (!setter) {
    throw new Error('useSetTabBarProps must be used within TabBarMotionProvider');
  }
  return setter;
}
