import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { publishFeedUpdates } from '../src/lib/server/websub';
import { serializeAtom, serializeJsonFeed, serializeRss } from '../src/lib/server/feeds';
import { SITE_FEEDS, WEBSUB_HUB } from '../src/lib/feeds';
import type { Post } from '../src/lib/posts-types';

function bucket() {
	const store = new Map<string, string>();
	return {
		store,
		get: async (key: string) => (store.has(key) ? { json: async () => JSON.parse(store.get(key)!) } : null),
		put: async (key: string, value: string) => { store.set(key, value); return {}; }
	} as unknown as R2Bucket & { store: Map<string, string> };
}
function assets(feeds: Record<string, string>) {
	return { fetch: async (request: Request) => new Response(feeds[new URL(request.url).pathname] ?? '', { status: feeds[new URL(request.url).pathname] ? 200 : 404 }) } as unknown as Fetcher;
}
const feeds = (text: string) => Object.fromEntries(SITE_FEEDS.map((feed) => [feed.path, `${feed.path} ${text}`]));
function hub(status = 204) {
	const calls: { url: string; body: string }[] = [];
	const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body) }); return new Response(null, { status }); }) as unknown as typeof fetch;
	return { calls, fetcher };
}

describe('WebSub', () => {
	test('every feed names the hub', () => {
		const post: Post = { slug: 'hello', type: 'note', date: '2026-11-05T23:30:00-05:00', content: 'Hi', filePath: 'notes/hello.md' };
		expect(serializeRss([post])).toContain(`<atom:link href="${WEBSUB_HUB}" rel="hub"/>`);
		expect(serializeAtom([post])).toContain(`<link href="${WEBSUB_HUB}" rel="hub"/>`);
		expect(JSON.parse(serializeJsonFeed([post])).hubs).toEqual([{ type: 'WebSub', url: WEBSUB_HUB }]);
	});

	test('the Link headers name the same hub and every feed', () => {
		const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
		for (const feed of SITE_FEEDS) expect(headers).toContain(`${feed.path}\n  Link: <${WEBSUB_HUB}>; rel="hub", <https://caseyagollan.com${feed.path}>; rel="self"`);
	});

	test('pings the hub for each feed once per change', async () => {
		const state = bucket();
		const { calls, fetcher } = hub();
		const env = { WEBSUB_ENABLED: 'true', ASSETS: assets(feeds('one')), PUBLISHING_STATE: state };
		expect(await publishFeedUpdates(env, fetcher)).toEqual({ status: 'pinged', feeds: SITE_FEEDS.length });
		expect(calls.map((call) => call.url)).toEqual(SITE_FEEDS.map(() => WEBSUB_HUB));
		expect(calls.map((call) => new URLSearchParams(call.body).get('hub.url'))).toEqual(SITE_FEEDS.map((feed) => `https://caseyagollan.com${feed.path}`));
		expect(new URLSearchParams(calls[0].body).get('hub.mode')).toBe('publish');
		expect(await publishFeedUpdates(env, fetcher)).toEqual({ status: 'unchanged' });
		expect(calls).toHaveLength(SITE_FEEDS.length);
		expect(await publishFeedUpdates({ ...env, ASSETS: assets(feeds('two')) }, fetcher)).toMatchObject({ status: 'pinged' });
		expect(calls).toHaveLength(SITE_FEEDS.length * 2);
	});

	test('retries next run when the hub fails, and stays off unless enabled', async () => {
		const state = bucket();
		const env = { WEBSUB_ENABLED: 'true', ASSETS: assets(feeds('one')), PUBLISHING_STATE: state };
		await expect(publishFeedUpdates(env, hub(503).fetcher)).rejects.toThrow('503');
		expect(state.store.size).toBe(0);
		expect(await publishFeedUpdates(env, hub().fetcher)).toMatchObject({ status: 'pinged' });
		const off = hub();
		expect(await publishFeedUpdates({ ...env, WEBSUB_ENABLED: undefined }, off.fetcher)).toEqual({ status: 'disabled' });
		expect(off.calls).toHaveLength(0);
	});

	test('a missing feed fails without pinging', async () => {
		const off = hub();
		await expect(publishFeedUpdates({ WEBSUB_ENABLED: 'true', ASSETS: assets({}), PUBLISHING_STATE: bucket() }, off.fetcher)).rejects.toThrow('404');
		expect(off.calls).toHaveLength(0);
	});
});
