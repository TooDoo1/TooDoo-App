import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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
  isLoggedIn: boolean;
  pendingRegistration: PendingRegistration | null;
  signIn: (nextToken: string) => void;
  signOut: () => void;
  setPendingRegistration: (payload: PendingRegistration) => void;
  clearPendingRegistration: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [pendingRegistration, setPendingRegistrationState] = useState<PendingRegistration | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isLoggedIn: Boolean(token),
      pendingRegistration,
      signIn: (nextToken: string) => setToken(nextToken),
      signOut: () => setToken(null),
      setPendingRegistration: (payload: PendingRegistration) => setPendingRegistrationState(payload),
      clearPendingRegistration: () => setPendingRegistrationState(null),
    }),
    [token, pendingRegistration]
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
