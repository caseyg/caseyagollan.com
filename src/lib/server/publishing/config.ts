import { authSettings, authStore, type IndieAuthEnvironment } from '../indieauth/contracts';
import type { PublishingConfig } from './micropub';
import { blueskyOAuthConfig } from './bluesky-oauth';
import { instanceOrigin, mastodonOAuthConfig } from './mastodon-oauth';

export interface PublishingEnvironment extends IndieAuthEnvironment {
	READWISE_ACCESS_TOKEN?: string;
	PESOS_ENABLED?: string;
	PUBLISHING_AUTH_MODE?: string;
	PUBLISHING_ENABLED?: string;
	PUBLISHING_MEDIA?: R2Bucket;
	PUBLISHING_MEDIA_BASE_URL?: string;
	/** Cloudflare Images; shrinks photos too large for a social network. */
	IMAGES?: ImagesBinding;
	PUBLISHING_STATE?: R2Bucket;
	PUBLISHING_DELIVERY_ENABLED?: string;
	PUBLISHING_MASTODON_INSTANCE?: string;
	PUBLISHING_MASTODON_TOKEN?: string;
	/** "false" turns Mastodon OAuth off, leaving only the static token. */
	PUBLISHING_MASTODON_OAUTH?: string;
	PUBLISHING_BLUESKY_SERVICE?: string;
	PUBLISHING_BLUESKY_IDENTIFIER?: string;
	PUBLISHING_BLUESKY_PASSWORD?: string;
	/** "false" turns Bluesky OAuth off, leaving only the app password. */
	PUBLISHING_BLUESKY_OAUTH?: string;
	PUBLISHING_ME?: string;
	PUBLISHING_INTROSPECTION_ENDPOINT?: string;
	PUBLISHING_INTROSPECTION_TOKEN?: string;
	PUBLISHING_GITHUB_OWNER?: string;
	PUBLISHING_GITHUB_REPO?: string;
	PUBLISHING_GITHUB_BRANCH?: string;
	PUBLISHING_GITHUB_TOKEN?: string;
	PUBLISHING_TIMEZONE?: string;
	PUBLISHING_DRAFTS_GITHUB_OWNER?: string;
	PUBLISHING_DRAFTS_GITHUB_REPO?: string;
	PUBLISHING_DRAFTS_GITHUB_BRANCH?: string;
	PUBLISHING_DRAFTS_GITHUB_TOKEN?: string;
}

/**
 * The private repository that holds composer drafts. It is separate from the public
 * content repository, so unpublished writing is never visible there.
 */
export function draftsConfig(env: PublishingEnvironment = {}): { owner: string; repo: string; branch: string; token: string } | undefined {
	if (env.PUBLISHING_ENABLED !== 'true') return;
	const config = {
		owner: env.PUBLISHING_DRAFTS_GITHUB_OWNER ?? env.PUBLISHING_GITHUB_OWNER ?? '', repo: env.PUBLISHING_DRAFTS_GITHUB_REPO ?? '',
		branch: env.PUBLISHING_DRAFTS_GITHUB_BRANCH ?? 'main', token: env.PUBLISHING_DRAFTS_GITHUB_TOKEN ?? env.PUBLISHING_GITHUB_TOKEN ?? ''
	};
	if (Object.values(config).some(value => !value.trim()) || (config.owner === env.PUBLISHING_GITHUB_OWNER && config.repo === env.PUBLISHING_GITHUB_REPO)) return;
	return config;
}

/**
 * Bluesky posting: OAuth once the owner connects it on /account (the session lives in
 * `PUBLISHING_STATE`), and the app password, when set, as the fallback.
 */
function bluesky(env: PublishingEnvironment, me: string) {
	const service = env.PUBLISHING_BLUESKY_SERVICE ?? 'https://bsky.social';
	const identifier = env.PUBLISHING_BLUESKY_IDENTIFIER?.trim();
	const password = env.PUBLISHING_BLUESKY_PASSWORD?.trim() ? env.PUBLISHING_BLUESKY_PASSWORD : undefined;
	const oauth = env.PUBLISHING_BLUESKY_OAUTH === 'false' ? undefined : blueskyOAuthConfig(me, env.PUBLISHING_STATE, identifier);
	if (!oauth && !(identifier && password)) return;
	return { service, ...(identifier ? { identifier } : {}), ...(password ? { password } : {}), ...(oauth ? { oauth } : {}) };
}

/**
 * Mastodon posting: OAuth once the owner connects the instance on /account (the session
 * lives in `PUBLISHING_STATE`), and the static token, when set, as the fallback.
 */
function mastodon(env: PublishingEnvironment, me: string) {
	const token = env.PUBLISHING_MASTODON_TOKEN?.trim() ? env.PUBLISHING_MASTODON_TOKEN : undefined;
	const named = env.PUBLISHING_MASTODON_INSTANCE?.trim();
	const oauth = env.PUBLISHING_MASTODON_OAUTH === 'false' || !named ? undefined : mastodonOAuthConfig(me, env.PUBLISHING_STATE, named);
	if (!oauth && !token) return;
	return { instance: oauth?.instance ?? instanceOrigin(named) ?? named ?? 'https://social.coop', ...(token ? { token } : {}), ...(oauth ? { oauth } : {}) };
}

export function publishingConfig(env: PublishingEnvironment = {}): PublishingConfig | undefined {
	if (env.PUBLISHING_ENABLED !== 'true') return;
	const internal = env.PUBLISHING_AUTH_MODE === 'internal';
	const authority = internal ? authSettings(env) : undefined;
	const store = internal ? authStore(env) : undefined;
	if (internal && (!authority || !store || authority.me !== env.PUBLISHING_ME)) return;
	const config = {
		me: env.PUBLISHING_ME, introspectionEndpoint: internal ? new URL('/auth/introspect', authority!.issuer).href : env.PUBLISHING_INTROSPECTION_ENDPOINT,
		owner: env.PUBLISHING_GITHUB_OWNER, repo: env.PUBLISHING_GITHUB_REPO,
		branch: env.PUBLISHING_GITHUB_BRANCH, token: env.PUBLISHING_GITHUB_TOKEN,
		timeZone: env.PUBLISHING_TIMEZONE ?? 'America/New_York'
	};
	if (Object.values(config).some(value => !value?.trim())) return;
	const blue = bluesky(env, config.me!);
	const masto = mastodon(env, config.me!);
	const syndication = {
		...(masto ? { mastodon: masto } : {}),
		...(blue ? { bluesky: blue } : {})
	};
	return { ...config, ...(store ? { introspect: (token: string) => store.invoke('introspectToken', { token }) } : {}), state: env.PUBLISHING_STATE, syndication, deliveryEnabled: env.PUBLISHING_DELIVERY_ENABLED === 'true', mediaBucket: env.PUBLISHING_MEDIA, mediaEnabled: Boolean(env.PUBLISHING_MEDIA), mediaBaseUrl: env.PUBLISHING_MEDIA_BASE_URL, images: env.IMAGES, introspectionToken: env.PUBLISHING_INTROSPECTION_TOKEN } as PublishingConfig;
}
