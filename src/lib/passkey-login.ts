import { rememberOwner } from './owner';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export { safeReturnTo } from './return-to';

export function passkeyError(cause: unknown): string {
 return cause instanceof Error && cause.name === 'NotAllowedError'
  ? 'The passkey prompt was canceled or timed out. You can try again.'
  : cause instanceof Error && cause.name === 'Error' ? cause.message : 'The passkey could not be used. Please try again.';
}

export async function signInWithPasskey(): Promise<void> {
 async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
   method: 'POST', credentials: 'same-origin', cache: 'no-store',
   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!response.ok) {
   if (response.status === 429) throw new Error('Too many attempts. Please wait before trying again.');
   if (response.status === 503) throw new Error('Account access is temporarily unavailable. Please try again later.');
   throw new Error('Sign-in could not be completed. Please try again.');
  }
  return response.json();
 }
 const challenge = await post<{ id: string; options: PublicKeyCredentialRequestOptionsJSON }>('/auth/passkey/login/options', {});
 const response = await startAuthentication({ optionsJSON: challenge.options });
 await post('/auth/passkey/login/verify', { id: challenge.id, response });
 rememberOwner(true);
}

/**
 * Branch previews have no passkeys; Casey signs in to them through production
 * (src/lib/server/indieauth/preview.ts). Returns that site, or undefined on production.
 */
export async function previewSignInIssuer(): Promise<string | undefined> {
 try {
  const response = await fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return;
  const { signInWith } = (await response.json()) as { signInWith?: unknown };
  return typeof signInWith === 'string' ? signInWith : undefined;
 } catch { return; }
}

export function previewSignInHref(returnTo: string): string {
 return `/auth/preview?returnTo=${encodeURIComponent(returnTo)}`;
}

export function issuerName(issuer: string): string {
 try { return new URL(issuer).host; } catch { return issuer; }
}
