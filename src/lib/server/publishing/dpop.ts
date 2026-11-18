/**
 * ES256 keys and signed JWTs for atproto OAuth: DPoP proofs (RFC 9449) and the
 * confidential client's `private_key_jwt` assertions (RFC 7523). Web Crypto only,
 * so it runs in the Worker without a JOSE library.
 */

/** A P-256 key pair as JWKs; the private half never leaves the Worker or its R2 bucket. */
export interface SigningKey { privateJwk: JsonWebKey; publicJwk: JsonWebKey; kid?: string }

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let binary = '';
	for (const byte of view) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const encode = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

/** A random URL-safe string, for `state`, `jti` and the PKCE verifier. */
export function randomToken(bytes = 32): string {
	return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function sha256(value: string): Promise<string> {
	return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** The public members only, as they go in a DPoP header or a JWKS. */
export function publicJwk(jwk: JsonWebKey): JsonWebKey {
	return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}
/** RFC 7638 thumbprint: a stable key id. */
export async function thumbprint(jwk: JsonWebKey): Promise<string> {
	return sha256(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }));
}

export async function generateSigningKey(): Promise<SigningKey> {
	const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']) as CryptoKeyPair;
	const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
	const pub = publicJwk(privateJwk);
	return { privateJwk: { ...pub, d: privateJwk.d }, publicJwk: pub, kid: await thumbprint(pub) };
}

/** Sign a compact JWS. Web Crypto's ECDSA output is already the raw r‖s form JWS uses. */
export async function signJwt(key: SigningKey, header: Record<string, unknown>, payload: Record<string, unknown>): Promise<string> {
	const signer = await crypto.subtle.importKey('jwk', { ...key.privateJwk, ext: true }, ALGORITHM, false, ['sign']);
	const input = `${encode({ alg: 'ES256', ...header })}.${encode(payload)}`;
	const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, encoder.encode(input));
	return `${input}.${base64url(signature)}`;
}

/**
 * A DPoP proof for one request. `htu` drops the query and fragment, as RFC 9449 asks;
 * `ath` binds the proof to the access token when one is sent.
 */
export async function dpopProof(key: SigningKey, method: string, url: string, options: { nonce?: string; accessToken?: string; now?: number } = {}): Promise<string> {
	const target = new URL(url);
	return signJwt(key, { typ: 'dpop+jwt', jwk: key.publicJwk }, {
		jti: randomToken(16), htm: method.toUpperCase(), htu: target.origin + target.pathname,
		iat: Math.floor((options.now ?? Date.now()) / 1000),
		...(options.nonce ? { nonce: options.nonce } : {}),
		...(options.accessToken ? { ath: await sha256(options.accessToken) } : {})
	});
}

/** The confidential client's assertion for one request to an authorization server. */
export async function clientAssertion(key: SigningKey, clientId: string, issuer: string, now = Date.now()): Promise<string> {
	const iat = Math.floor(now / 1000);
	return signJwt(key, { kid: key.kid }, { iss: clientId, sub: clientId, aud: issuer, jti: randomToken(16), iat, exp: iat + 60 });
}
