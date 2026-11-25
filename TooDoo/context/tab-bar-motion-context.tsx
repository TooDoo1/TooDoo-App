import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
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

type Listener = () => void;

/**
 * Tab bar navigation props change on every tab press. Keeping them in React
 * state on the provider that wraps the stack re-rendered the whole app.
 * Screens subscribe only if they call useTabBarProps().
 */
let tabBarPropsSnapshot: BottomTabBarProps | null = null;
const tabBarPropsListeners = new Set<Listener>();

function subscribeTabBarProps(listener: Listener) {
  tabBarPropsListeners.add(listener);
  return () => {
    tabBarPropsListeners.delete(listener);
  };
}

function getTabBarPropsSnapshot() {
  return tabBarPropsSnapshot;
}

export function setTabBarPropsStore(props: BottomTabBarProps | null) {
  if (tabBarPropsSnapshot === props) return;
  tabBarPropsSnapshot = props;
  tabBarPropsListeners.forEach((listener) => listener());
}

const TabBarMotionContext = createContext<TabBarMotionContextValue | null>(null);

export function TabBarMotionProvider({ children }: { children: ReactNode }) {
  const stackHideProgress = useSharedValue(0);
  const scrollHideProgress = useSharedValue(0);
  const stackHideCountRef = useRef(0);

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

  return <TabBarMotionContext.Provider value={value}>{children}</TabBarMotionContext.Provider>;
}

export function useTabBarMotion() {
  const context = useContext(TabBarMotionContext);
  if (!context) {
    throw new Error('useTabBarMotion must be used within TabBarMotionProvider');
  }
  return context;
}

export function useTabBarProps() {
  return useSyncExternalStore(subscribeTabBarProps, getTabBarPropsSnapshot, getTabBarPropsSnapshot);
}

export function useSetTabBarProps() {
  return setTabBarPropsStore;
}
