import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type WebStackSwipeContextValue = {
  translateX: SharedValue<number>;
};

const WebStackSwipeContext = createContext<WebStackSwipeContextValue | null>(null);

export function WebStackSwipeProvider({ children }: { children: ReactNode }) {
  const translateX = useSharedValue(0);

  const value = useMemo(() => ({ translateX }), [translateX]);

  return <WebStackSwipeContext.Provider value={value}>{children}</WebStackSwipeContext.Provider>;
}

export function useWebStackSwipe() {
  const context = useContext(WebStackSwipeContext);
  if (!context) {
    throw new Error('useWebStackSwipe must be used within WebStackSwipeProvider');
  }
  return context;
}
