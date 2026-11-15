import { describe, expect, test } from 'bun:test';
import { applyAction, curateInsights, curateSources, emptyCuration, isBlocked, isPinned, pageSummary, parseCuration, urlKey } from '../src/lib/graph-curation';
import { summarizePage } from '../src/lib/server/graph-curation';

const source = (url: string, title = url) => ({ url, title, page_age: null, cited_text: null });

describe('graph curation', () => {
	test('pinned sources come first, once, and are marked', () => {
		const curation = applyAction(emptyCuration(), { action: 'pin', topic: 'Research', source: source('https://www.example.com/a/') });
		const result = curateSources('Research', [source('https://example.com/a'), source('https://other.org/')], curation);
		expect(result.map((s) => s.url)).toEqual(['https://www.example.com/a/', 'https://other.org/']);
		expect(result[0].pinned).toBe(true);
		expect(result[1].pinned).toBeUndefined();
		expect(isPinned('Research', 'https://example.com/a#x', curation)).toBe(true);
		expect(isPinned('Design', 'https://example.com/a', curation)).toBe(false);
	});

	test('blocking a URL hides only it and removes its pins', () => {
		let curation = applyAction(emptyCuration(), { action: 'pin', topic: 'Research', source: source('https://example.com/a') });
		curation = applyAction(curation, { action: 'block-url', url: 'https://example.com/a/' });
		expect(curation.pinned).toEqual({});
		expect(curateSources('Research', [source('https://example.com/a'), source('https://example.com/b')], curation).map((s) => s.url)).toEqual(['https://example.com/b']);
	});

	test('blocking a domain hides it and its subdomains, not lookalikes', () => {
		const curation = applyAction(emptyCuration(), { action: 'block-domain', url: 'https://www.example.com/page' });
		expect(curation.blockedDomains).toEqual(['example.com']);
		expect(isBlocked('https://blog.example.com/x', curation)).toBe(true);
		expect(isBlocked('https://example.com/', curation)).toBe(true);
		expect(isBlocked('https://notexample.com/', curation)).toBe(false);
	});

	test('pinning a blocked URL unblocks it', () => {
		let curation = applyAction(emptyCuration(), { action: 'block-url', url: 'https://example.com/a' });
		curation = applyAction(curation, { action: 'pin', topic: 'Research', source: source('https://example.com/a') });
		expect(curation.blockedUrls).toEqual([]);
	});

	test('unpin removes the topic when it was the last pin', () => {
		let curation = applyAction(emptyCuration(), { action: 'pin', topic: 'Research', source: source('https://example.com/a') });
		curation = applyAction(curation, { action: 'unpin', topic: 'Research', url: 'https://example.com/a' });
		expect(curation.pinned).toEqual({});
	});

	test('curateInsights adds topics that only have pins and leaves the input alone', () => {
		const curation = applyAction(emptyCuration(), { action: 'pin', topic: 'Casey', source: source('https://example.com/') });
		const insights = new Map([['Research', { insight: 'x', sources: [source('https://a.org/')] }]]);
		const result = curateInsights(insights, curation);
		expect(result.get('Casey')?.sources?.map((s) => s.url)).toEqual(['https://example.com/']);
		expect(result.get('Research')?.sources?.length).toBe(1);
		expect((insights.get('Research')?.sources?.[0] as { pinned?: boolean }).pinned).toBeUndefined();
	});

	test('leading sources (wiki pages) go after pins and before search results, and obey blocks', () => {
		let curation = applyAction(emptyCuration(), { action: 'pin', topic: 'Design', source: source('https://pinned.org/') });
		curation = applyAction(curation, { action: 'block-url', url: 'https://cag.wiki/Hidden' });
		const leading = new Map([['Design', [source('https://cag.wiki/Design'), source('https://cag.wiki/Hidden')]], ['Sociocracy', [source('https://cag.wiki/Sociocracy')]]]);
		const result = curateInsights(new Map([['Design', { sources: [source('https://kagi.example/'), source('https://cag.wiki/Design')] }]]), curation, leading);
		expect(result.get('Design')?.sources?.map((s) => s.url)).toEqual(['https://pinned.org/', 'https://cag.wiki/Design', 'https://kagi.example/']);
		expect(result.get('Sociocracy')?.sources?.map((s) => s.url)).toEqual(['https://cag.wiki/Sociocracy']);
	});

	test('parseCuration drops malformed data', () => {
		const curation = parseCuration({ pinned: { Research: [{ url: 'javascript:alert(1)' }, { url: 'https://ok.org/' }], '': [{ url: 'https://x.org' }] }, blockedUrls: ['nope', 'https://b.org/'], blockedDomains: ['WWW.Bad.com', '<script>'] });
		expect(curation.pinned).toEqual({ Research: [{ url: 'https://ok.org/', title: 'ok.org', page_age: null, cited_text: null }] });
		expect(curation.blockedUrls).toEqual(['https://b.org/']);
		expect(curation.blockedDomains).toEqual(['bad.com']);
		expect(parseCuration(null)).toEqual(emptyCuration());
	});

	test('urlKey ignores www, fragments and trailing slashes', () => {
		expect(urlKey('https://www.Example.com/a/#top')).toBe(urlKey('https://example.com/a'));
		expect(urlKey('https://example.com/a?x=1')).not.toBe(urlKey('https://example.com/a'));
	});

	test('pageSummary reads og tags, then title and description', () => {
		const og = pageSummary('<head><meta property="og:title" content="Hello &amp; welcome"><meta content=\'About it\' name="description"><title>Ignored</title></head>', 'https://example.com/');
		expect(og).toEqual({ url: 'https://example.com/', title: 'Hello & welcome', page_age: null, cited_text: 'About it' });
		expect(pageSummary('<title>\n  Plain  </title>', 'https://example.com/').title).toBe('Plain');
		expect(pageSummary('', 'https://www.example.com/x').title).toBe('example.com');
	});
});

describe('summarizePage', () => {
	const dns = () => Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
	test('names a page from its HTML', async () => {
		const fetcher = (async (input: string) => input.startsWith('https://cloudflare-dns.com') ? dns() : new Response('<title>A page</title>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
		expect(await summarizePage('https://example.com/a', fetcher)).toEqual({ fetched: true, source: { url: 'https://example.com/a', title: 'A page', page_age: null, cited_text: null } });
	});
	test('keeps a page it cannot read, named by host', async () => {
		const fetcher = (async (input: string) => input.startsWith('https://cloudflare-dns.com') ? dns() : new Response('nope', { status: 500 })) as typeof fetch;
		expect(await summarizePage('https://www.example.com/a', fetcher)).toEqual({ fetched: false, source: { url: 'https://www.example.com/a', title: 'example.com', page_age: null, cited_text: null } });
	});
	test('refuses private hosts without fetching them', async () => {
		let fetched = 0;
		const fetcher = (async () => { fetched++; return new Response(''); }) as unknown as typeof fetch;
		expect((await summarizePage('https://localhost/a', fetcher)).fetched).toBe(false);
		expect(fetched).toBe(0);
	});
});

describe('/api/graph-curation', () => {
	test('refuses changes without the owner session', async () => {
		const { POST } = await import('../src/routes/api/graph-curation/+server');
		const request = new Request('https://caseyagollan.com/api/graph-curation', { method: 'POST', headers: { origin: 'https://caseyagollan.com', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'block-domain', url: 'https://example.com/' }) });
		const response = await POST({ request, platform: { env: {} } } as never);
		expect(response.status).toBe(401);
	});
	test('serves the curation to everyone, without a token', async () => {
		const { GET } = await import('../src/routes/api/graph-curation/+server');
		const stored = { pinned: { Research: [{ url: 'https://ok.org/', title: 'OK' }] } };
		const bucket = { get: async () => ({ json: async () => stored }) };
		const response = await GET({ request: new Request('https://caseyagollan.com/api/graph-curation'), platform: { env: { PUBLISHING_STATE: bucket } } } as never);
		const data = await response.json() as { owner: boolean; csrf?: string; curation: { pinned: Record<string, unknown[]> } };
		expect(data.owner).toBe(false);
		expect(data.csrf).toBeUndefined();
		expect(data.curation.pinned.Research.length).toBe(1);
	});
});
