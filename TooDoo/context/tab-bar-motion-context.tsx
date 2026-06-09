import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type TabBarMotionContextValue = {
  stackHideProgress: SharedValue<number>;
  tabBarProps: BottomTabBarProps | null;
  setTabBarProps: (props: BottomTabBarProps | null) => void;
};

const TabBarMotionContext = createContext<TabBarMotionContextValue | null>(null);

export function TabBarMotionProvider({ children }: { children: ReactNode }) {
  const stackHideProgress = useSharedValue(0);
  const [tabBarProps, setTabBarPropsState] = useState<BottomTabBarProps | null>(null);

  const setTabBarProps = useCallback((props: BottomTabBarProps | null) => {
    setTabBarPropsState(props);
  }, []);

  const value = useMemo(
    () => ({
      stackHideProgress,
      tabBarProps,
      setTabBarProps,
    }),
    [stackHideProgress, tabBarProps, setTabBarProps]
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
