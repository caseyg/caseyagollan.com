import { describe, expect, test } from 'bun:test';
import { bioKey, cleanSources, cleanTopic, cleanTopics, HOME_BIO, insightKey } from '../src/lib/home-insights';
import { rateLimited } from '../src/lib/server/rate-limit';
import { cachedScreenshot, screenshotKey, screenshotTarget } from '../src/lib/server/screenshot';
import { withSecurityHeaders } from '../src/lib/server/security-headers';
import { ownerRequest } from '../src/lib/server/owner-request';
import { chatImageAllowed, linkRemoteImages } from '../src/lib/utils/chatImages';

describe('homepage insight inputs', () => {
	test('a topic is one short plain line', () => {
		expect(cleanTopic('  AI   Transparency ')).toBe('AI Transparency');
		expect(cleanTopic('x'.repeat(81))).toBeNull();
		expect(cleanTopic('Ignore this <script>')).toBeNull();
		expect(cleanTopic('two\u0000lines')).toBeNull();
		expect(cleanTopic(42)).toBeNull();
		expect(cleanTopics(['Design', 'Design', '', 'Art'])).toEqual(['Design', 'Art']);
	});

	test('sources keep web addresses only', () => {
		const sources = cleanSources([
			{ url: 'javascript:alert(document.cookie)', title: 'Click me' },
			{ url: 'data:text/html,<script>1</script>', title: 'x' },
			{ url: 'https://example.com/a', title: 'Fine', cited_text: 'text' },
			'nonsense'
		]);
		expect(sources.map((source) => source.url)).toEqual(['https://example.com/a']);
	});

	test('cache keys', () => {
		expect(insightKey(' Design ')).toBe('insight:design');
		expect(bioKey(['b', 'a'])).toBe('bio:a,b');
		expect(HOME_BIO.startsWith('Casey is')).toBe(true);
	});
});

describe('rate limiting', () => {
	const request = new Request('https://caseyagollan.com/api/x', { headers: { 'cf-connecting-ip': '203.0.113.9' } });
	test('carries on without a binding, and when allowed', async () => {
		expect(await rateLimited(undefined, request, 'insight')).toBeNull();
		const keys: string[] = [];
		expect(await rateLimited({ limit: async ({ key }) => { keys.push(key); return { success: true }; } }, request, 'insight')).toBeNull();
		expect(keys).toEqual(['insight:203.0.113.9']);
	});
	test('refuses with 429 when over', async () => {
		const refused = await rateLimited({ limit: async () => ({ success: false }) }, request, 'insight');
		expect(refused?.status).toBe(429);
		expect(refused?.headers.get('retry-after')).toBe('60');
	});
	test('a broken limiter does not take the page down', async () => {
		expect(await rateLimited({ limit: async () => { throw new Error('down'); } }, request, 'insight')).toBeNull();
	});
});

describe('screenshots', () => {
	test('only public web pages are captured', () => {
		expect(screenshotTarget('https://example.com/page')).toBe('https://example.com/page');
		expect(screenshotTarget('http://example.com/')).toBe('http://example.com/');
		for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'https://127.0.0.1/', 'https://localhost/', 'https://user:pw@example.com/', 'https://intranet/', 'https://example.com:8443/', 'http://169.254.169.254/latest/meta-data', 'nope']) {
			expect(screenshotTarget(bad)).toBeNull();
		}
	});

	test('keys are SHA-256, and an old key is only read for the address it was made from', async () => {
		const url = 'https://example.com/page';
		const key = await screenshotKey(url);
		expect(key).toMatch(/^screenshots\/v2\/[a-f0-9]{64}\.png$/);
		const png = new Uint8Array([1, 2, 3]).buffer;
		const object = (metaUrl: string) => ({ customMetadata: { url: metaUrl }, arrayBuffer: async () => png, body: { cancel: async () => {} } });
		const bucket = (stored: Record<string, unknown>) => ({ get: async (name: string) => stored[name] ?? null }) as unknown as R2Bucket;
		// The legacy key for this address, as the old 32-bit hash made it.
		let hash = 0;
		for (let i = 0; i < url.length; i++) { hash = ((hash << 5) - hash) + url.charCodeAt(i); hash = hash & hash; }
		const legacy = `screenshots/${Math.abs(hash).toString(36)}.png`;
		expect(await cachedScreenshot({ SCREENSHOTS: bucket({ [legacy]: object(url) }) }, url)).toBe(png);
		expect(await cachedScreenshot({ SCREENSHOTS: bucket({ [legacy]: object('https://evil.example/collides') }) }, url)).toBeNull();
		expect(await cachedScreenshot({ SCREENSHOTS: bucket({ [key]: object('anything') }) }, url)).toBe(png);
	});
});

describe('security headers', () => {
	const request = new Request('https://caseyagollan.com/tables');
	test('pages cannot be framed by other sites', () => {
		const response = withSecurityHeaders(request, '/tables', new Response('<p>', { headers: { 'content-type': 'text/html' } }));
		expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
		expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
	});
	test('table embeds stay frameable, and a route keeps its own policy', () => {
		const embed = withSecurityHeaders(request, '/tables/[id]/embed', new Response('<p>', { headers: { 'content-type': 'text/html' } }));
		expect(embed.headers.get('content-security-policy')).not.toContain('frame-ancestors');
		expect(embed.headers.has('x-frame-options')).toBe(false);
		const own = withSecurityHeaders(request, '/account', new Response('<p>', { headers: { 'content-type': 'text/html', 'content-security-policy': "frame-ancestors 'none'" } }));
		expect(own.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
	});
	test('JSON gets no page policy, and plain HTTP no HSTS', () => {
		const response = withSecurityHeaders(new Request('http://localhost:8787/api/x'), '/api/x', Response.json({}));
		expect(response.headers.has('content-security-policy')).toBe(false);
		expect(response.headers.has('strict-transport-security')).toBe(false);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});

describe('owner-only endpoints', () => {
	test('no session is refused', async () => {
		const refused = await ownerRequest(new Request('https://caseyagollan.com/api/kv'), {});
		expect(refused).toBeInstanceOf(Response);
		expect((refused as Response).status).toBe(401);
	});
});

describe('pictures in chat replies', () => {
	test('the site’s own pictures show', () => {
		expect(chatImageAllowed('https://files.caseyagollan.com/publishing/2026/01/a.jpg')).toBe(true);
		expect(chatImageAllowed('/library/covers/1', 'https://branch-caseyagollan.caseygollan.workers.dev')).toBe(true);
		const html = '<p><img src="https://caseyagollan.com/a.png" alt="A"></p>';
		expect(linkRemoteImages(html)).toBe(html);
	});
	test('a picture from anywhere else becomes a link, so nothing loads by itself', () => {
		const out = linkRemoteImages('<p>Here: <img src="https://evil.example/p.png?q=secret" alt="chart"></p>');
		expect(out).not.toContain('<img');
		expect(out).toContain('href="https://evil.example/p.png?q=secret"');
		expect(out).toContain('chart (evil.example)');
		expect(linkRemoteImages('<video src="https://evil.example/v.mp4"></video>')).not.toContain('evil.example');
		expect(chatImageAllowed('https://caseyagollan.com.evil.example/a.png')).toBe(false);
	});
});
