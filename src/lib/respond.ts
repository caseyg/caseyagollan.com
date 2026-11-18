/**
 * Ways a visitor can answer a post: on its Mastodon or Bluesky copy, or from their own
 * site with a Webmention. Responses on the copies come back through backfeed, and Webmentions
 * through webmention.io, so every route ends up under the post (see `WebmentionList`).
 */

import { SITE_IDENTITY } from './identity';

/** Where Webmentions for the site go, as the `rel=webmention` link in the root layout says. */
export const WEBMENTION_ENDPOINT = 'https://webmention.io/caseyagollan.com/webmention';

export type RespondAction = 'reply' | 'like' | 'repost';

/** The post's copies on the networks it was syndicated to: the first copy on each, as threads list every post. */
export interface PostCopies {
	mastodon?: string;
	bluesky?: string;
}

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
};

/** A Mastodon status address: `/@user/123` or `/users/user/statuses/123`. */
const MASTODON_PATH = /^\/(@[^/]+|users\/[^/]+\/statuses)\/\d+\/?$/;

/** Reads the copies out of a post's `syndication` list. The first one per network is the thread's root. */
export function postCopies(syndication: string[] = []): PostCopies {
	const copies: PostCopies = {};
	for (const url of syndication) {
		const host = hostOf(url);
		if (!host) continue;
		if (host === 'bsky.app' && /\/post\//.test(url)) copies.bluesky ??= url;
		else if (MASTODON_PATH.test(new URL(url).pathname)) copies.mastodon ??= url;
	}
	return copies;
}

/** The Mastodon server the site's own account is on, which visitors without one of their own can use. */
export const HOME_SERVER = hostOf(SITE_IDENTITY.profiles.find((profile) => profile.label === 'Mastodon')?.href ?? '') || 'social.coop';

/**
 * Turns what a visitor typed for their server into a hostname: `mastodon.social`,
 * `https://mastodon.social/`, `@me@mastodon.social` and `me@mastodon.social` all give `mastodon.social`.
 * Returns undefined for something that can't be a hostname.
 */
export function normalizeServer(input: string): string | undefined {
	let value = input.trim().toLowerCase();
	if (!value) return undefined;
	if (value.includes('@') && !value.includes('/')) value = value.slice(value.lastIndexOf('@') + 1);
	value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '');
	if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(value)) return undefined;
	return value;
}

/**
 * Opens a post on the visitor's own server, signed in, so they can reply, favorite or boost it there.
 * Mastodon (and servers that copy its routes, such as GoToSocial and Akkoma) look the post up and
 * show it. On the post's own server the address works as it is.
 */
export function mastodonInteractUrl(server: string, status: string): string {
	if (hostOf(status) === server) return status;
	return `https://${server}/authorize_interaction?uri=${encodeURIComponent(status)}`;
}

/** A new Mastodon post with the link in it, for a post that has no copy on Mastodon. */
export function mastodonShareUrl(server: string, text: string): string {
	return `https://${server}/share?text=${encodeURIComponent(text)}`;
}

/** A new Bluesky post with the link in it. */
export function blueskyComposeUrl(text: string): string {
	return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

/** The mf2 property a post on the visitor's own site uses for each action. */
export const WEB_PROPERTY: Record<RespondAction, string> = {
	reply: 'u-in-reply-to',
	like: 'u-like-of',
	repost: 'u-repost-of'
};

export type WebmentionOutcome =
	| { ok: true; status: 'queued' }
	| { ok: false; status: 'invalid' | 'failed'; message: string };

/** Checks the address a visitor gives for their response before anything is sent. */
export function webmentionSourceError(source: string, target: string): string | undefined {
	let url: URL;
	try {
		url = new URL(source.trim());
	} catch {
		return 'Paste the full address of your post, starting with https://.';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Paste the full address of your post, starting with https://.';
	if (url.href === new URL(target).href) return 'That’s this post. Paste the address of your own post that links here.';
	return undefined;
}

/**
 * Sends a Webmention, as a form would, so it needs no preflight: webmention.io answers with
 * `Access-Control-Allow-Origin: *`. It checks the source asynchronously, so success means queued.
 */
export async function sendWebmention(source: string, target: string, endpoint = WEBMENTION_ENDPOINT, request: typeof fetch = fetch): Promise<WebmentionOutcome> {
	const invalid = webmentionSourceError(source, target);
	if (invalid) return { ok: false, status: 'invalid', message: invalid };
	try {
		const response = await request(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ source: source.trim(), target })
		});
		if (response.ok) return { ok: true, status: 'queued' };
		const body = (await response.json().catch(() => ({}))) as { error_description?: string };
		return { ok: false, status: response.status < 500 ? 'invalid' : 'failed', message: body.error_description ? `Webmention.io said: ${body.error_description}` : 'That Webmention wasn’t accepted.' };
	} catch {
		return { ok: false, status: 'failed', message: 'That didn’t go through. Try again in a moment.' };
	}
}
