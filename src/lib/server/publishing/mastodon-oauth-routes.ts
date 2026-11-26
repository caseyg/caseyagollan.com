/** Shared by the Mastodon OAuth routes: the client config, and the cookie that ties a sign-in to one browser. */
import { publishingConfig, type PublishingEnvironment } from './config';
import type { MastodonOAuthConfig } from './mastodon-oauth';

export const BINDING_COOKIE = '__Host-mastodon-oauth';
export const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

/** The OAuth client, when publishing and Mastodon OAuth are on and this is the site's own origin. */
export function oauthFor(env: PublishingEnvironment | undefined, requestUrl: string): { oauth: MastodonOAuthConfig; tokenFallback: boolean } | undefined {
	const mastodon = publishingConfig(env)?.syndication?.mastodon;
	if (!mastodon?.oauth || new URL(requestUrl).origin !== mastodon.oauth.origin) return;
	return { oauth: mastodon.oauth, tokenFallback: Boolean(mastodon.token) };
}
export function bindingCookie(value: string, maxAge = 600): string {
	return `${BINDING_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function readBinding(request: Request): string | undefined {
	return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(BINDING_COOKIE + '='))?.slice(BINDING_COOKIE.length + 1);
}
