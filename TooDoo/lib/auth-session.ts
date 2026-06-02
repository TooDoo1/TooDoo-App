import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthSession = {
  token: string;
  refreshToken: string | null;
  role: string | null;
};

const TOKEN_KEY = 'toodoo_auth_token';
const REFRESH_TOKEN_KEY = 'toodoo_auth_refresh_token';
const ROLE_KEY = 'toodoo_auth_role';

export async function loadAuthSession(): Promise<AuthSession | null> {
  try {
    const [token, refreshToken, role] = await AsyncStorage.multiGet([TOKEN_KEY, REFRESH_TOKEN_KEY, ROLE_KEY]);
    const access = token[1];
    if (!access) return null;
    return {
      token: access,
      refreshToken: refreshToken[1],
      role: role[1],
    };
  } catch {
    return null;
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  const pairs: [string, string][] = [[TOKEN_KEY, session.token]];
  if (session.refreshToken) pairs.push([REFRESH_TOKEN_KEY, session.refreshToken]);
  else await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  if (session.role) pairs.push([ROLE_KEY, session.role]);
  else await AsyncStorage.removeItem(ROLE_KEY);
  await AsyncStorage.multiSet(pairs);
}

export async function clearAuthSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, ROLE_KEY]);
}
