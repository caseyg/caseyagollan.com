import { describe, expect, test } from 'bun:test';
import { chatAgo, chatPage, chatTitle, latestAssistantLine, threadTitle, type ChatMessage } from '../src/lib/chat';
import { readableMarkdown } from '../src/lib/server/chat/fetch-page';
import { chatViewer, startVisitorSession, viewerFrom, withViewer, VIEWER_HEADER } from '../src/lib/server/chat/identity';
import { discoverIndieAuth, finishLogin, instanceOrigin, LOGIN_COOKIE, profileAddress, safeReturn, startLogin } from '../src/lib/server/chat/login';
import { callMicropubTool, handleMcpHttp, handleMcpMessage, micropubMcpClient, MICROPUB_TOOLS, type MicropubCall } from '../src/lib/server/chat/micropub-mcp';
import { streamCompletion } from '../src/lib/server/chat/model';
import { agentSearchDocument, searchDocuments } from '../src/lib/server/chat/site-search';

function bucket() {
	const objects = new Map<string, string>();
	return {
		objects,
		async get(key: string) { const value = objects.get(key); return value === undefined ? null : { json: async () => JSON.parse(value) }; },
		async put(key: string, value: string) { objects.set(key, value); },
		async delete(key: string) { objects.delete(key); }
	} as unknown as R2Bucket & { objects: Map<string, string> };
}

describe('site search for the agent', () => {
	const docs = [
		agentSearchDocument('/2026/11/14/threads/', 'Syndication threads over Micropub', 'article', { date: '2026-11-14T10:00:00Z', tags: 'indieweb, micropub' }, '<h1>Syndication threads over Micropub</h1><p>A post can carry its social copy as a reply chain.</p>'),
		agentSearchDocument('/library/9780262', 'Ours to Hack and to Own', 'book', { year: '2017', tags: 'cooperatives' }, '<h1>Ours to Hack and to Own</h1><p>Platform cooperativism &amp; the internet.</p>'),
		agentSearchDocument('/wiki/indieweb', 'IndieWeb', 'wiki', {}, '<h1>IndieWeb</h1><p>Own your data. Micropub, Webmention.</p>')
	];

	test('documents are plain text without the repeated title', () => {
		expect(docs[0].x).toBe('A post can carry its social copy as a reply chain.');
		expect(docs[0].d).toBe('2026-11-14');
		expect(docs[1].x).toContain('Platform cooperativism & the internet');
	});

	test('title matches rank first and every word must match', () => {
		const results = searchDocuments(docs, 'micropub');
		expect(results.map((result) => result.url)).toEqual(['/2026/11/14/threads/', '/wiki/indieweb']);
		expect(searchDocuments(docs, 'micropub cooperatives')).toEqual([]);
		expect(searchDocuments(docs, 'cooperativism', { type: 'book' })[0].title).toBe('Ours to Hack and to Own');
		expect(searchDocuments(docs, 'cooperativism', { type: 'wiki' })).toEqual([]);
	});
});

describe('fetch_page Markdown', () => {
	test('keeps structure and text it has no Markdown for', () => {
		const markdown = readableMarkdown('<h2>Title</h2><p>Some <strong>bold</strong> and <a href="/x">a link</a>.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th></tr><tr><td>1</td></tr></table><script>bad()</script><custom-tag>kept</custom-tag>', 'https://example.com/page');
		expect(markdown).toContain('## Title');
		expect(markdown).toContain('Some **bold** and [a link](https://example.com/x).');
		expect(markdown).toContain('- One\n- Two');
		expect(markdown).toContain('| A |');
		expect(markdown).toContain('kept');
		expect(markdown).not.toContain('bad()');
	});
});

describe('chat titles', () => {
	test('first line, trimmed', () => {
		expect(chatTitle('## What has Casey written about **Micropub**?\nmore')).toBe('What has Casey written about Micropub?');
		expect(chatTitle('word '.repeat(30)).endsWith('…')).toBe(true);
	});

	test('cleans up a model-written title', () => {
		expect(threadTitle('"Casey’s Micropub posts."')).toBe('Casey’s Micropub posts');
		expect(threadTitle('<think>The user asks about books</think>\n\n**Title:** Cooperative books in the library')).toBe('Cooperative books in the library');
		expect(threadTitle('<think>never finished')).toBe('');
		expect(threadTitle('  \n ok')).toBe('');
	});

	test('says when a thread last moved', () => {
		const now = Date.UTC(2026, 10, 18, 12);
		expect(chatAgo(now - 20_000, now)).toBe('just now');
		expect(chatAgo(now - 5 * 60_000, now)).toBe('5 min ago');
		expect(chatAgo(now - 3 * 3600_000, now)).toBe('3 h ago');
	});
});

describe('who is chatting', () => {
	test('the browser cannot set the viewer header', () => {
		const forged = new Request('https://caseyagollan.com/agents/chat-thread/abcdefghij', { headers: { [VIEWER_HEADER]: encodeURIComponent(JSON.stringify({ id: 'x', name: 'Casey', owner: true, via: 'owner' })) } });
		expect(viewerFrom(withViewer(forged, null))).toBeNull();
		const set = withViewer(forged, { id: 'mastodon:ana@social.coop', name: 'Ana', via: 'mastodon', owner: false });
		expect(viewerFrom(set)?.owner).toBe(false);
	});

	test('visitor sessions never make the owner, even for the owner’s own site', async () => {
		const state = bucket();
		const env = { PUBLISHING_STATE: state, AUTH_ENABLED: 'false' };
		const cookie = await startVisitorSession(env, { id: 'web:https://caseyagollan.com/', name: 'caseyagollan.com', url: 'https://caseyagollan.com/', via: 'indieauth' });
		const token = /=([^;]+)/.exec(cookie)![1];
		const viewer = await chatViewer(new Request('https://caseyagollan.com/chat/', { headers: { cookie: `__Host-chat-session=${token}` } }), env);
		expect(viewer?.owner).toBe(false);
		expect([...state.objects.keys()][0]).not.toContain(token);
		expect(await chatViewer(new Request('https://caseyagollan.com/chat/', { headers: { cookie: '__Host-chat-session=nope' } }), env)).toBeNull();
	});
});

describe('sign-in helpers', () => {
	test('addresses', () => {
		expect(profileAddress('jo.example')).toBe('https://jo.example/');
		expect(profileAddress('http://jo.example/me')).toBe('https://jo.example/me');
		expect(() => profileAddress('localhost')).toThrow();
		expect(instanceOrigin('@ana@social.coop')).toBe('https://social.coop');
		expect(instanceOrigin('mastodon.social')).toBe('https://mastodon.social');
		expect(safeReturn('/chat/abcdefghij')).toBe('/chat/abcdefghij');
		expect(safeReturn('https://evil.example/')).toBe('/chat');
		expect(safeReturn('/tables/my-table')).toBe('/tables/my-table');
		expect(safeReturn('/tables/../admin')).toBe('/chat');
		expect(safeReturn('/chat/../account')).toBe('/chat');
	});

	test('IndieAuth discovery reads metadata, then the older link', async () => {
		const pages: Record<string, Response> = {
			'https://a.example/': new Response('<link rel="indieauth-metadata" href="/meta">', { headers: { 'content-type': 'text/html' } }),
			'https://a.example/meta': Response.json({ issuer: 'https://a.example/', authorization_endpoint: 'https://a.example/auth' }),
			'https://b.example/': new Response('', { headers: { 'content-type': 'text/html', link: '<https://indieauth.example/auth>; rel="authorization_endpoint"' } })
		};
		const fetcher = async (url: string) => pages[url] ?? new Response('', { status: 404 });
		expect(await discoverIndieAuth('https://a.example/', fetcher)).toEqual({ me: 'https://a.example/', authorizationEndpoint: 'https://a.example/auth', issuer: 'https://a.example/' });
		expect((await discoverIndieAuth('https://b.example/', fetcher)).authorizationEndpoint).toBe('https://indieauth.example/auth');
	});

	test('an IndieAuth sign-in round trip, bound to the browser that started it', async () => {
		const state = bucket();
		let exchanged: URLSearchParams | undefined;
		const fetcher = async (url: string, init?: RequestInit) => {
			if (url === 'https://jo.example/') return new Response('<link rel="authorization_endpoint" href="https://jo.example/auth">', { headers: { 'content-type': 'text/html' } });
			if (url === 'https://jo.example/auth' && init?.method === 'POST') { exchanged = new URLSearchParams(String(init.body)); return Response.json({ me: 'https://jo.example/', profile: { name: 'Jo', photo: 'https://jo.example/me.jpg' } }); }
			return new Response('', { status: 404 });
		};
		const context = { bucket: state, origin: 'https://caseyagollan.com', fetcher };
		const { location, binding } = await startLogin(context, 'indieauth', 'jo.example', '/chat');
		const target = new URL(location);
		expect(target.searchParams.get('client_id')).toBe('https://caseyagollan.com/chat/client.json');
		expect(target.searchParams.get('scope')).toBe('profile');
		const query = new URLSearchParams({ code: 'abc', state: target.searchParams.get('state')! });
		await expect(finishLogin(context, 'indieauth', query, 'wrong')).rejects.toThrow('browser that started it');
		// The failed attempt used the pending login up: it can't be retried.
		const again = await startLogin(context, 'indieauth', 'jo.example', '/chat/abcdefghij');
		const query2 = new URLSearchParams({ code: 'abc', state: new URL(again.location).searchParams.get('state')! });
		const { author, returnTo } = await finishLogin(context, 'indieauth', query2, again.binding);
		expect(author).toEqual({ id: 'web:https://jo.example/', name: 'Jo', url: 'https://jo.example/', photo: 'https://jo.example/me.jpg', via: 'indieauth' });
		expect(returnTo).toBe('/chat/abcdefghij');
		expect(exchanged?.get('code_verifier')).toBeTruthy();
		expect(binding).not.toBe(again.binding);
		expect(LOGIN_COOKIE.startsWith('__Host-')).toBe(true);
	});
});

describe('the Micropub MCP bridge', () => {
	const calls: { query: string; body?: unknown }[] = [];
	const call: MicropubCall = async (query, init) => {
		calls.push({ query, body: init?.body ? JSON.parse(String(init.body)) : undefined });
		if (query === '?q=config') return Response.json({ 'post-types': [{ type: 'note' }] });
		return new Response(null, { status: 202, headers: { location: 'https://caseyagollan.com/2026/11/18/x/' } });
	};

	test('initialize and list tools over JSON-RPC', async () => {
		const init = await handleMcpMessage(call, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
		expect((init?.result as { serverInfo: { name: string } }).serverInfo.name).toBe('caseyagollan-micropub');
		const list = await handleMcpMessage(call, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
		expect((list?.result as { tools: unknown[] }).tools.length).toBe(MICROPUB_TOOLS.length);
		expect(await handleMcpMessage(call, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
		expect((await handleMcpMessage(call, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'delete_everything' } }))?.error).toBeTruthy();
	});

	test('new posts are drafts unless asked to publish', async () => {
		calls.length = 0;
		const result = await callMicropubTool(call, 'micropub_create_post', { content: 'Hello **world**', category: ['test'] });
		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain('Location: https://caseyagollan.com/2026/11/18/x/');
		expect(calls[0].body).toEqual({ type: ['h-entry'], properties: { content: ['Hello **world**'], category: ['test'], 'post-status': ['draft'] } });
		await callMicropubTool(call, 'micropub_create_post', { content: 'Out now', post_status: 'published' });
		expect((calls[1].body as { properties: Record<string, string[]> }).properties['post-status']).toEqual(['published']);
		expect((await callMicropubTool(call, 'micropub_create_post', {})).isError).toBe(true);
	});

	test('the in-process client speaks the same protocol', async () => {
		const client = micropubMcpClient(call);
		expect((await client.tools()).map((tool) => tool.name)).toContain('micropub_update_post');
		expect((await client.call('micropub_config', {})).text).toContain('post-types');
	});

	test('the HTTP transport wants an IndieAuth token and passes nothing else', async () => {
		const unauthorized = await handleMcpHttp(new Request('https://caseyagollan.com/micropub/mcp', { method: 'POST', body: '{}' }), call);
		expect(unauthorized.status).toBe(401);
		const ok = await handleMcpHttp(new Request('https://caseyagollan.com/micropub/mcp', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) }), call);
		expect(await ok.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
	});
});

describe('inference.coop streaming', () => {
	test('gathers text and tool calls split across chunks', async () => {
		const events = [
			{ choices: [{ delta: { content: 'Hel' } }] },
			{ choices: [{ delta: { content: 'lo' } }] },
			{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_site', arguments: '{"que' } }] } }] },
			{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] }, finish_reason: 'tool_calls' }] }
		];
		const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
		let sent: Record<string, unknown> | undefined;
		const fetcher = (async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(body, { headers: { 'content-type': 'text/event-stream' } }); }) as unknown as typeof fetch;
		const seen: string[] = [];
		const result = await streamCompletion({ apiKey: 'k', model: 'glm-flash-green', messages: [{ role: 'user', content: 'hi' }], fetcher, onText: (text) => seen.push(text) });
		expect(result.text).toBe('Hello');
		expect(seen).toEqual(['Hel', 'lo']);
		expect(result.toolCalls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'search_site', arguments: '{"query":"x"}' } }]);
		expect(result.finishReason).toBe('tool_calls');
		expect(sent?.stream).toBe(true);
	});
});

describe('Pi transcript as chat messages', () => {
	const { projectMessages, diffMessages, SAY_KIND } = require('../src/lib/server/chat/projection') as typeof import('../src/lib/server/chat/projection');
	const ana = { id: 'mastodon:ana@social.coop', name: 'Ana', via: 'mastodon' as const };
	const say = (id: string, text: string, at = 1000) => ({ id: `e${id}`, kind: SAY_KIND, data: { id, author: ana, owner: false, at, text }, model: [{ role: 'user', content: `Ana wrote:\n\n${text}`, timestamp: at }] });
	const answer = (id: string, content: unknown[], at = 2000) => ({ id, kind: 'pi.assistant', model: [{ role: 'assistant', content, model: 'glm-flash-green', timestamp: at, usage: { input: 1000, output: 200 } }] });
	const result = (id: string, callId: string, toolName: string, text: string, isError = false) => ({ id, kind: 'pi.tool-result', model: [{ role: 'toolResult', toolCallId: callId, toolName, content: [{ type: 'text', text }], isError }] });

	test('one message per person, one reply per run with its steps', () => {
		const messages = projectMessages([
			say('m1', 'What about Micropub?'),
			answer('e2', [{ type: 'text', text: 'Let me look.' }, { type: 'toolCall', id: 'c1', name: 'search_site', arguments: { query: 'micropub' } }]),
			result('e3', 'c1', 'search_site', JSON.stringify([{ url: 'https://caseyagollan.com/a', title: 'A' }])),
			answer('e4', [{ type: 'text', text: 'Casey wrote [A](https://caseyagollan.com/a).' }])
		]);
		expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
		expect(messages[0].content).toBe('What about Micropub?');
		expect(messages[1].id).toBe('r-m1');
		expect(messages[1].content).toBe('Let me look.\n\nCasey wrote [A](https://caseyagollan.com/a).');
		expect(messages[1].tools).toEqual([{ tool: 'search_site', label: 'Searched the site for “micropub”', status: 'done', links: [{ url: 'https://caseyagollan.com/a', title: 'A' }] }]);
	});

	test('the live answer streams, then a failure says why', () => {
		const streaming = projectMessages([say('m1', 'Hi')], { run: {}, generation: { message: { role: 'assistant', content: [{ type: 'text', text: 'Hel' }] } } });
		expect(streaming[1]).toMatchObject({ id: 'r-m1', status: 'streaming', content: 'Hel' });
		const failed = projectMessages([say('m1', 'Hi')], { runFailure: { reason: 'model_error' } });
		expect(failed[1]).toMatchObject({ status: 'failed', content: '*The answer stopped: the model answered with an error.*' });
		expect(diffMessages([streaming[0], streaming[1]], [streaming[0], { ...streaming[1], content: 'Hello' }])).toEqual([{ type: 'chat:delta', id: 'r-m1', text: 'lo' }]);
	});

	test('Micropub output never becomes a public link', () => {
		const messages = projectMessages([
			say('m1', 'Draft a note'),
			answer('e2', [{ type: 'toolCall', id: 'c1', name: 'micropub_create_post', arguments: { content: 'x' } }]),
			result('e3', 'c1', 'micropub_create_post', 'Location: https://caseyagollan.com/private-draft')
		]);
		expect(messages[1].tools).toEqual([{ tool: 'micropub_create_post', label: 'Saved a draft', status: 'done' }]);
	});

	test('what an answer costs', () => {
		const { costOf, priceOf, resetsOn } = require('../src/lib/server/chat/budget') as typeof import('../src/lib/server/chat/budget');
		expect(costOf([answer('e1', [])])).toBeCloseTo((1000 * 0.11 + 200 * 0.44) / 1e6, 10);
		expect(costOf([{ model: [{ role: 'assistant', usage: { cost: { total: 0.5 } } }] }])).toBe(0.5);
		expect(priceOf('unknown').input).toBe(1.8);
		expect(resetsOn(Date.UTC(2026, 10, 18))).toBe('December 1');
	});
});

describe('latestAssistantLine', () => {
	const reply = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: 'a', role: 'assistant', content, status: 'done', createdAt: 0, ...extra });
	const ask: ChatMessage = { id: 'u', role: 'user', content: 'Set these out', status: 'done', createdAt: 0 };

	test('is null before the assistant has answered', () => {
		expect(latestAssistantLine([ask])).toBeNull();
	});

	test('takes the last line of the newest reply, without Markdown', () => {
		const text = 'I set out **three** books.\n\n- Moved [Rebel Cities](https://example.com) to the *left*\n- Added `a note`';
		expect(latestAssistantLine([reply('Old'), ask, reply(text)])).toEqual({ text: 'Added a note', writing: false });
	});

	test('skips code blocks and table rules', () => {
		expect(latestAssistantLine([reply('Here it is:\n```js\nx()\n```\n| a |\n|---|')])?.text).toBe('| a |');
		expect(latestAssistantLine([reply('Done.\n```\ncode')])?.text).toBe('Done.');
	});

	test('says what it is doing before it writes', () => {
		const step = { tool: 'search_site', label: 'Searched for cooperatives', status: 'running' as const };
		expect(latestAssistantLine([ask, reply('', { status: 'streaming', tools: [step] })])).toEqual({ text: 'Searched for cooperatives…', writing: true });
		expect(latestAssistantLine([ask, reply('', { status: 'streaming' })])).toEqual({ text: 'Thinking…', writing: true });
		expect(latestAssistantLine([ask, reply('', { status: 'failed' })])?.text).toBe('The assistant couldn’t answer.');
	});
});

describe('chatPage', () => {
	test('keeps a path on this site, a tidy title and a table id', () => {
		expect(chatPage({ path: '/posts/2026/hello/', title: '  Hello\n world ', table: 'abc-123' })).toEqual({ path: '/posts/2026/hello/', title: 'Hello world', table: 'abc-123' });
	});

	test('refuses anything that isn’t a path here', () => {
		expect(chatPage({ path: 'https://example.com/' })).toBeNull();
		expect(chatPage({ path: '//example.com/' })).toBeNull();
		expect(chatPage(null)).toBeNull();
		expect(chatPage({ path: '/x', table: 'Not An Id!', title: 3 })).toEqual({ path: '/x' });
	});
});
