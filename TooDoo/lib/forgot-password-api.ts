import { apiUrl } from '@/lib/api';

export type PasswordResetTokenResponse = {
  message?: string;
  emailSent?: boolean;
  emailError?: 'MISSING_SMTP_CONFIG' | 'SMTP_SEND_FAILED';
  emailErrorDetail?: string;
  error?: string;
};

export type PasswordResetResponse = {
  message?: string;
  error?: string;
};

export function getPasswordResetRequestErrorMessage(
  status: number,
  data: PasswordResetTokenResponse
): string {
  if (status === 404) {
    return 'Ingen användare med den e-postadressen. Kontrollera stavningen — använd samma e-post som vid registrering.';
  }

  if (status === 500) {
    return 'Servern kunde inte skicka återställningslänken just nu. Försök igen om en stund eller kontakta support på info@toodoo.se.';
  }

  return data.error ?? 'Kunde inte skicka återställningslänk just nu.';
}

export async function requestPasswordResetEmail(email: string) {
  const response = await fetch(apiUrl('/user/forgot-password/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });

  const data = (await response.json().catch(() => ({}))) as PasswordResetTokenResponse;
  return { response, data };
}

export async function resetPasswordWithToken(input: {
  email: string;
  token: string;
  password: string;
}) {
  const response = await fetch(apiUrl('/user/forgot-password/reset'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email.trim(),
      token: input.token.trim(),
      password: input.password,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as PasswordResetResponse;
  return { response, data };
}
