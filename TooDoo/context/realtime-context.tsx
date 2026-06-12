import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/auth-context';
import { connectRealtimeStream, type RealtimeEvent } from '@/lib/realtime';

type RealtimeListener = (event: RealtimeEvent) => void;

type RealtimeContextValue = {
  subscribe: (listener: RealtimeListener) => () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, isLoggedIn, isAuthReady } = useAuth();
  const listenersRef = useRef(new Set<RealtimeListener>());

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady || !isLoggedIn || !token) {
      return;
    }

    let closed = false;
    let connection: ReturnType<typeof connectRealtimeStream> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = INITIAL_RETRY_MS;

    const emit = (event: RealtimeEvent) => {
      listenersRef.current.forEach((listener) => {
        listener(event);
      });
    };

    const scheduleReconnect = () => {
      if (closed) return;
      connection?.close();
      connection = null;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    };

    const connect = () => {
      if (closed) return;

      connection?.close();
      connection = connectRealtimeStream(
        token,
        (event) => {
          retryMs = INITIAL_RETRY_MS;
          emit(event);
        },
        scheduleReconnect
      );
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      connection?.close();
      connection = null;
    };
  }, [isAuthReady, isLoggedIn, token]);

  const value = useMemo(
    () => ({
      subscribe,
    }),
    [subscribe]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used inside RealtimeProvider');
  }
  return context;
}
