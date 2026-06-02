import { apiUrl } from '@/lib/api';
import type { AuthSession } from '@/lib/auth-session';

type RefreshResponse = {
  token?: string;
  refreshToken?: string;
  error?: string;
};

export async function refreshAuthSession(refreshToken: string): Promise<AuthSession | null> {
  const res = await fetch(apiUrl('/user/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const json = (await res.json().catch(() => ({}))) as RefreshResponse;
  if (!res.ok || !json.token) return null;

  return {
    token: json.token,
    refreshToken: json.refreshToken ?? refreshToken,
    role: null,
  };
}
