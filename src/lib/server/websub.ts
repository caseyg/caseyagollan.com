/**
 * WebSub publishing. The feeds name a hub (rel="hub"); after a deploy changes them, the Worker's
 * cron tells the hub, which fetches the feeds and pushes new posts to subscribed readers.
 *
 * The cron reads the deployed feeds from the Worker's own assets, so it sees exactly what this
 * version serves, and it pings only when they differ from what it last told the hub about.
 */
import { SITE_FEEDS, SITE_URL, WEBSUB_HUB } from '../feeds';

export interface WebSubEnvironment {
	WEBSUB_ENABLED?: string;
	ASSETS?: Pick<Fetcher, 'fetch'>;
	PUBLISHING_STATE?: Pick<R2Bucket, 'get' | 'put'>;
}

export type WebSubResult = { status: 'disabled' | 'unchanged' } | { status: 'pinged'; feeds: number };

const STATE_KEY = 'websub/feeds.json';

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Fingerprint of every deployed feed, so a change to any of them is noticed. */
async function feedsFingerprint(assets: Pick<Fetcher, 'fetch'>): Promise<string> {
	const bodies = await Promise.all(
		SITE_FEEDS.map(async (feed) => {
			const response = await assets.fetch(new Request(new URL(feed.path, SITE_URL)));
			if (!response.ok) throw new Error(`Feed ${feed.path} returned ${response.status}`);
			return `${feed.path}\n${await response.text()}`;
		})
	);
	return sha256(bodies.join('\n'));
}

/** Tell the hub that each feed changed (WebSub §7, hub.mode=publish). */
export async function pingHub(fetcher: typeof fetch = fetch, hub = WEBSUB_HUB): Promise<number> {
	await Promise.all(
		SITE_FEEDS.map(async (feed) => {
			const body = new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': new URL(feed.path, SITE_URL).href });
			const response = await fetcher(hub, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
			if (!response.ok) throw new Error(`Hub answered ${response.status} for ${feed.path}`);
		})
	);
	return SITE_FEEDS.length;
}

/** Ping the hub once per feed change. Nothing is saved unless every ping succeeded, so a failure retries next run. */
export async function publishFeedUpdates(env: WebSubEnvironment, fetcher: typeof fetch = fetch): Promise<WebSubResult> {
	if (env.WEBSUB_ENABLED !== 'true' || !env.ASSETS || !env.PUBLISHING_STATE) return { status: 'disabled' };
	const fingerprint = await feedsFingerprint(env.ASSETS);
	const stored = await env.PUBLISHING_STATE.get(STATE_KEY);
	const previous = stored ? ((await stored.json()) as { fingerprint?: string }).fingerprint : undefined;
	if (previous === fingerprint) return { status: 'unchanged' };
	const feeds = await pingHub(fetcher);
	await env.PUBLISHING_STATE.put(STATE_KEY, JSON.stringify({ fingerprint, pingedAt: new Date().toISOString() }), {
		httpMetadata: { contentType: 'application/json' }
	});
	return { status: 'pinged', feeds };
}
