import type { PublishingConfig } from './micropub';

export interface PublishingEnvironment {
	PUBLISHING_ENABLED?: string;
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
	const config = {
		me: env.PUBLISHING_ME, introspectionEndpoint: env.PUBLISHING_INTROSPECTION_ENDPOINT,
		introspectionToken: env.PUBLISHING_INTROSPECTION_TOKEN,
		owner: env.PUBLISHING_GITHUB_OWNER, repo: env.PUBLISHING_GITHUB_REPO,
		branch: env.PUBLISHING_GITHUB_BRANCH, token: env.PUBLISHING_GITHUB_TOKEN,
		timeZone: env.PUBLISHING_TIMEZONE ?? 'America/New_York'
	};
	if (Object.values(config).some(value => !value?.trim())) return;
	return config as PublishingConfig;
}
