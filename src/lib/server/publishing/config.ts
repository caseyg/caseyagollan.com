import { authSettings, authStore, type IndieAuthEnvironment } from '../indieauth/contracts';
import type { PublishingConfig } from './micropub';

export interface PublishingEnvironment extends IndieAuthEnvironment {
	PUBLISHING_AUTH_MODE?: string;
	PUBLISHING_ENABLED?: string;
	PUBLISHING_MEDIA?: R2Bucket;
	PUBLISHING_MEDIA_BASE_URL?: string;
	PUBLISHING_STATE?: R2Bucket;
	PUBLISHING_DELIVERY_ENABLED?: string;
	PUBLISHING_MASTODON_INSTANCE?: string;
	PUBLISHING_MASTODON_TOKEN?: string;
	PUBLISHING_BLUESKY_SERVICE?: string;
	PUBLISHING_BLUESKY_IDENTIFIER?: string;
	PUBLISHING_BLUESKY_PASSWORD?: string;
	PUBLISHING_ME?: string;
	PUBLISHING_INTROSPECTION_ENDPOINT?: string;
	PUBLISHING_INTROSPECTION_TOKEN?: string;
	PUBLISHING_GITHUB_OWNER?: string;
	PUBLISHING_GITHUB_REPO?: string;
	PUBLISHING_GITHUB_BRANCH?: string;
	PUBLISHING_GITHUB_TOKEN?: string;
	PUBLISHING_TIMEZONE?: string;
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
	const syndication = {
		...(env.PUBLISHING_MASTODON_TOKEN?.trim() ? { mastodon: { instance: env.PUBLISHING_MASTODON_INSTANCE ?? 'https://social.coop', token: env.PUBLISHING_MASTODON_TOKEN } } : {}),
		...(env.PUBLISHING_BLUESKY_IDENTIFIER?.trim() && env.PUBLISHING_BLUESKY_PASSWORD?.trim() ? { bluesky: { service: env.PUBLISHING_BLUESKY_SERVICE ?? 'https://bsky.social', identifier: env.PUBLISHING_BLUESKY_IDENTIFIER, password: env.PUBLISHING_BLUESKY_PASSWORD } } : {})
	};
	return { ...config, ...(store ? { introspect: (token: string) => store.invoke('introspectToken', { token }) } : {}), state: env.PUBLISHING_STATE, syndication, deliveryEnabled: env.PUBLISHING_DELIVERY_ENABLED === 'true', mediaEnabled: Boolean(env.PUBLISHING_MEDIA), mediaBaseUrl: env.PUBLISHING_MEDIA_BASE_URL, introspectionToken: env.PUBLISHING_INTROSPECTION_TOKEN } as PublishingConfig;
}
