export const AUTH_SCOPES = ['profile', 'read', 'create', 'update', 'delete', 'draft', 'media'] as const;
export const AUTH_TOKEN_NAME_MAX_LENGTH = 100;
export function tokenName(value: unknown): string | undefined {
 if (value === undefined) return;
 if (typeof value !== 'string' || value.length > AUTH_TOKEN_NAME_MAX_LENGTH) authError('invalid_request');
 return value.trim() || undefined;
}
export interface AuthSettings { issuer: string; me: string; rpID: string; rpName: string; tokenTTL: number; setupToken?: string }
export interface IndieAuthEnvironment {
 AUTH_ENABLED?: string; AUTH_ORIGIN?: string; AUTH_ME?: string; AUTH_RP_NAME?: string;
 AUTH_SETUP_TOKEN?: string; AUTH_INTROSPECTION_TOKEN?: string; AUTH_TOKEN_TTL_SECONDS?: string;
 AUTH_STORE?: DurableObjectNamespace;
}
export interface AuthorizationRequest { clientId: string; redirectUri: string; state?: string; scope: string[]; codeChallenge: string; clientName?: string }
export interface SessionInfo { csrf: string; expiresAt: number }
export interface TokenInfo { active: boolean; me?: string; client_id?: string; scope?: string; exp?: number; iat?: number }
export interface TokenResponse { access_token: string; token_type: 'Bearer'; me: string; scope: string; expires_in: number }
export interface OwnerAuthorization { setupToken?: string; session?: string; csrf?: string }
export interface AuthOperations {
 status: { input: Record<string, never>; output: { credentialCount: number; setupAvailable: boolean } };
 registrationOptions: { input: { authorization: OwnerAuthorization; origin: string }; output: { id: string; options: Record<string, unknown> } };
 registrationVerify: { input: { id: string; response: unknown; authorization: OwnerAuthorization; origin: string }; output: { sessionToken: string; csrf: string; expiresAt: number } };
 authenticationOptions: { input: { origin: string }; output: { id: string; options: Record<string, unknown> } };
 authenticationVerify: { input: { id: string; response: unknown; origin: string }; output: { sessionToken: string; csrf: string; expiresAt: number } };
 session: { input: { token: string }; output: SessionInfo | null };
 logout: { input: { session: string; csrf: string }; output: boolean };
 createRequest: { input: AuthorizationRequest; output: { id: string } };
 request: { input: { id: string }; output: AuthorizationRequest | null };
 approveRequest: { input: { id: string; session: string; csrf: string; scope: string[] }; output: { code: string; redirectUri: string; state?: string } };
 exchangeCode: { input: { code: string; clientId: string; redirectUri: string; verifier: string }; output: TokenResponse };
 introspectToken: { input: { token: string }; output: TokenInfo };
 revokeToken: { input: { token: string; clientId?: string }; output: boolean };
 listTokens: { input: { session: string }; output: { id: string; clientId: string; name?: string; scope: string; createdAt: number; expiresAt: number }[] };
 revokeTokenById: { input: { id: string; session: string; csrf: string }; output: boolean };
 personalToken: { input: { session: string; csrf: string; scope: string[]; name?: string }; output: TokenResponse };
 listCredentials: { input: { session: string }; output: { id: string; createdAt: number; deviceType?: string; backedUp?: boolean }[] };
 removeCredential: { input: { id: string; session: string; csrf: string }; output: boolean };
 rateLimit: { input: { key: string }; output: boolean };
}
export interface AuthRPC { invoke<K extends keyof AuthOperations>(operation: K, input: AuthOperations[K]['input']): Promise<AuthOperations[K]['output']> }
export type AuthOperation = keyof AuthOperations;
export const AUTH_ERRORS: Record<string, number> = { invalid_request: 400, invalid_client: 400, invalid_redirect_uri: 400, invalid_scope: 400, invalid_grant: 400, unsupported_grant_type: 400, invalid_token: 401, invalid_owner_auth: 401, invalid_authentication: 401, access_denied: 403, setup_closed: 403, csrf_failed: 403, credential_limit: 409, last_credential: 409, slow_down: 429, temporarily_unavailable: 503 };
export function authError(code: keyof typeof AUTH_ERRORS): never { throw new Error(`indieauth:${code}`); }
export function authSettings(env: IndieAuthEnvironment): AuthSettings | undefined {
 if (env.AUTH_ENABLED !== 'true' || !env.AUTH_STORE || !env.AUTH_ORIGIN) return;
 try {
  const issuer = new URL(env.AUTH_ORIGIN); const me = new URL(env.AUTH_ME ?? 'https://caseyagollan.com/');
  for (const url of [issuer,me]) if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) return;
  const ttl = Number(env.AUTH_TOKEN_TTL_SECONDS ?? 30 * 86400);
  if (!Number.isInteger(ttl) || ttl < 300 || ttl > 90 * 86400) return;
  return { issuer: issuer.origin + '/', me: me.href, rpID: issuer.hostname, rpName: env.AUTH_RP_NAME ?? 'Casey Gollan', tokenTTL: ttl, setupToken: env.AUTH_SETUP_TOKEN };
 } catch { return; }
}
export function authStore(env: IndieAuthEnvironment): AuthRPC | undefined {
 if (!authSettings(env) || !env.AUTH_STORE) return;
 return env.AUTH_STORE.get(env.AUTH_STORE.idFromName('owner')) as unknown as AuthRPC;
}
