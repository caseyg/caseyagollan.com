/** Shared by the Bluesky OAuth routes: the client config, and the cookie that ties a sign-in to one browser. */
import { publishingConfig, type PublishingEnvironment } from './config';
import type { BlueskyOAuthConfig } from './bluesky-oauth';

export const BINDING_COOKIE = '__Host-bluesky-oauth';
export const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

/** The OAuth client, when publishing and Bluesky OAuth are on and this is the site's own origin. */
export function oauthFor(env: PublishingEnvironment | undefined, requestUrl: string): { oauth: BlueskyOAuthConfig; passwordFallback: boolean } | undefined {
	const bluesky = publishingConfig(env)?.syndication?.bluesky;
	if (!bluesky?.oauth || new URL(requestUrl).origin !== new URL(bluesky.oauth.clientId).origin) return;
	return { oauth: bluesky.oauth, passwordFallback: Boolean(bluesky.identifier && bluesky.password) };
}
export function bindingCookie(value: string, maxAge = 600): string {
	return `${BINDING_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function readBinding(request: Request): string | undefined {
	return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(BINDING_COOKIE + '='))?.slice(BINDING_COOKIE.length + 1);
}
