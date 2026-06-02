import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiUrl } from '@/lib/api';
import { refreshAuthSession } from '@/lib/auth-api';
import { clearAuthSession, loadAuthSession, saveAuthSession, type AuthSession } from '@/lib/auth-session';

type PendingRegistration = {
  email: string;
  password: string;
  accountType: 'user' | 'company';
  companyName?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER';
  interests?: string[];
};

type AuthContextValue = {
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  isAuthReady: boolean;
  role: string | null;
  pendingRegistration: PendingRegistration | null;
  signIn: (nextToken: string, refreshToken?: string | null, role?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  setPendingRegistration: (payload: PendingRegistration) => void;
  clearPendingRegistration: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [pendingRegistration, setPendingRegistrationState] = useState<PendingRegistration | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  const applySession = useCallback(async (session: AuthSession | null) => {
    sessionRef.current = session;
    setToken(session?.token ?? null);
    setRefreshToken(session?.refreshToken ?? null);
    setRole(session?.role ?? null);
    if (session) {
      await saveAuthSession(session);
    } else {
      await clearAuthSession();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadAuthSession();
      if (cancelled) return;

      if (stored?.refreshToken) {
        const refreshed = await refreshAuthSession(stored.refreshToken);
        if (cancelled) return;
        if (refreshed) {
          await applySession({
            token: refreshed.token,
            refreshToken: refreshed.refreshToken,
            role: stored.role ?? refreshed.role,
          });
          setIsAuthReady(true);
          return;
        }
      }

      if (stored?.token) {
        await applySession(stored);
      }
      if (!cancelled) setIsAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const signIn = useCallback(
    async (nextToken: string, nextRefreshToken?: string | null, nextRole?: string | null) => {
      const session: AuthSession = {
        token: nextToken,
        refreshToken: typeof nextRefreshToken === 'string' ? nextRefreshToken : null,
        role: typeof nextRole === 'string' ? nextRole : null,
      };
      await applySession(session);
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    await applySession(null);
  }, [applySession]);

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const doFetch = (accessToken: string | null) => {
        const headers = new Headers(init?.headers ?? {});
        if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
        return fetch(apiUrl(path), { ...init, headers });
      };

      let accessToken = sessionRef.current?.token ?? null;
      let refresh = sessionRef.current?.refreshToken ?? null;
      let res = await doFetch(accessToken);

      if (res.status === 401 && refresh) {
        const renewed = await refreshAuthSession(refresh);
        if (renewed) {
          const nextSession: AuthSession = {
            token: renewed.token,
            refreshToken: renewed.refreshToken,
            role: sessionRef.current?.role ?? null,
          };
          await applySession(nextSession);
          accessToken = nextSession.token;
          res = await doFetch(accessToken);
        } else {
          await signOut();
        }
      }

      return res;
    },
    [applySession, signOut]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      refreshToken,
      isLoggedIn: Boolean(token),
      isAuthReady,
      role,
      pendingRegistration,
      signIn,
      signOut,
      authFetch,
      setPendingRegistration: (payload: PendingRegistration) => setPendingRegistrationState(payload),
      clearPendingRegistration: () => setPendingRegistrationState(null),
    }),
    [token, refreshToken, isAuthReady, role, pendingRegistration, signIn, signOut, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
