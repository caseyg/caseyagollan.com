import { describe, expect, test } from 'bun:test';
import { chatAgo, chatPage, chatSelection, chatTitle, sayPrefix, latestAssistantLine, messageParts, stepsSummary, threadTitle, type ChatMessage } from '../src/lib/chat';
import { readableMarkdown } from '../src/lib/server/chat/fetch-page';
import { chatViewer, startVisitorSession, viewerFrom, withViewer, VIEWER_HEADER } from '../src/lib/server/chat/identity';
import { discoverIndieAuth, finishLogin, instanceOrigin, LOGIN_COOKIE, profileAddress, safeReturn, startLogin } from '../src/lib/server/chat/login';
import { callMicropubTool, handleMcpHttp, handleMcpMessage, micropubMcpClient, MICROPUB_TOOLS, type MicropubCall } from '../src/lib/server/chat/micropub-mcp';
import { streamCompletion } from '../src/lib/server/chat/model';
import { agentSearchDocument, daysBefore, findDocuments, localDate, searchDocuments } from '../src/lib/server/chat/site-search';

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
	const { projectMessages, diffMessages, SAY_KIND, RESPONSE_SHOWN } = require('../src/lib/server/chat/projection') as typeof import('../src/lib/server/chat/projection');
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
		expect(messages[1].tools).toEqual([{ tool: 'search_site', label: 'Searched the site for “micropub”', status: 'done', at: 12, request: [{ name: 'Query', value: 'micropub' }], response: '[{"url":"https://caseyagollan.com/a","title":"A"}]', links: [{ url: 'https://caseyagollan.com/a', title: 'A' }] }]);
		// The reply reads in the order it happened: text, the step, the rest.
		expect(messageParts(messages[1]).map((part) => part.type === 'text' ? part.text.trim() : part.steps.map((step) => step.tool))).toEqual(['Let me look.', ['search_site'], 'Casey wrote [A](https://caseyagollan.com/a).']);
	});

	test('steps keep their place, and what they were asked and answered', () => {
		const messages = projectMessages([
			say('m1', 'Look around'),
			answer('e2', [{ type: 'toolCall', id: 'c1', name: 'search_site', arguments: { query: 'a', page_size: 8, empty: '' } }]),
			result('e3', 'c1', 'search_site', '{"results":[]}'),
			answer('e4', [{ type: 'text', text: 'Nothing yet.  \n\n' }, { type: 'toolCall', id: 'c2', name: 'fetch_page', arguments: { url: 'https://example.com/x' } }, { type: 'toolCall', id: 'c3', name: 'fetch_page', arguments: { url: 'https://example.com/y' } }]),
			result('e5', 'c2', 'fetch_page', 'x'.repeat(RESPONSE_SHOWN + 50)),
			result('e6', 'c3', 'fetch_page', 'example.com answered 403.', true),
			answer('e7', [{ type: 'text', text: 'Done.' }])
		]);
		const [first, second, third] = messages[1].tools!;
		expect(first).toMatchObject({ at: 0, request: [{ name: 'Query', value: 'a' }, { name: 'Page size', value: '8' }], response: '{"results":[]}' });
		expect(second.at).toBe('Nothing yet.'.length);
		expect(second.response).toHaveLength(RESPONSE_SHOWN + 1);
		expect(third).toMatchObject({ status: 'failed', error: 'example.com answered 403.' });
		expect(third.response).toBeUndefined();
		expect(messageParts(messages[1]).map((part) => part.type === 'text' ? part.text.trim() : part.steps.length)).toEqual([1, 'Nothing yet.', 2, 'Done.']);
		expect(stepsSummary(messages[1].tools!)).toBe('Searched the site, read 2 pages, 1 didn’t work');
		expect(stepsSummary([first])).toBe('Searched the site for “a”');
		// Steps with no place (older threads) come before the text.
		expect(messageParts({ content: 'Hello', tools: [{ tool: 'go_to', label: 'Took you to /library', status: 'done' }] }).map((part) => part.type)).toEqual(['steps', 'text']);
	});

	test('the live answer streams, then a failure says why', () => {
		const streaming = projectMessages([say('m1', 'Hi')], { run: {}, generation: { message: { role: 'assistant', content: [{ type: 'text', text: 'Hel' }] } } });
		expect(streaming[1]).toMatchObject({ id: 'r-m1', status: 'streaming', content: 'Hel' });
		const failed = projectMessages([say('m1', 'Hi')], { runFailure: { reason: 'model_error' } });
		expect(failed[1]).toMatchObject({ status: 'failed', content: '*The answer stopped: the model answered with an error.*' });
		expect(diffMessages([streaming[0], streaming[1]], [streaming[0], { ...streaming[1], content: 'Hello' }])).toEqual([{ type: 'chat:delta', id: 'r-m1', text: 'lo' }]);
	});

	test('messages sent while the assistant works show at once, and a steer splits the reply where it joined', () => {
		const queued = (id: string, mode: string) => ({ id: `s${id}`, mode, entry: { kind: SAY_KIND, data: { id, author: ana, owner: false, at: 3000, text: `text ${id}` } } });
		const working = [say('m1', 'Find posts'), answer('e2', [{ type: 'toolCall', id: 'c1', name: 'search_site', arguments: { query: 'x' } }])];
		// The one that waits was sent first, but the one joining this answer is placed first.
		const before = projectMessages(working, { run: {} }, 5000, [queued('later', 'followUp'), queued('steer', 'steer'), { id: 'w', mode: 'write', entry: { kind: 'app.note' } }]);
		expect(before.map((message) => message.id)).toEqual(['m1', 'r-m1', 'steer', 'later']);
		expect(before[2]).toMatchObject({ role: 'user', content: 'text steer', author: ana, status: 'done' });
		expect(before[1].status).toBe('streaming');

		// The steer is placed after the tool round: the reply so far ends, and a new one answers it.
		const after = projectMessages([...working, result('e3', 'c1', 'search_site', '[]'), say('steer', 'text steer', 3000)], { run: {} }, 5000, [queued('later', 'followUp')]);
		expect(after.map((message) => message.id)).toEqual(['m1', 'r-m1', 'steer', 'r-steer', 'later']);
		expect(after[1].status).toBe('done');
		expect(after[3].status).toBe('streaming');
		const events = diffMessages(before, after);
		expect(events.at(-1)).toEqual({ type: 'chat:order', ids: ['m1', 'r-m1', 'steer', 'r-steer', 'later'] });
		expect(events.filter((event) => event.type === 'chat:message').map((event) => event.type === 'chat:message' && event.message.id)).toEqual(['r-steer']);
		// New messages at the end need no order.
		expect(diffMessages(before.slice(0, 2), before).map((event) => event.type)).toEqual(['chat:message', 'chat:message']);
	});

	test('a browser may name its message, within limits', () => {
		const { chatSayId, chatAuthor } = require('../src/lib/chat') as typeof import('../src/lib/chat');
		expect(chatSayId('abcDEF012_-xyz45')).toBe('abcDEF012_-xyz45');
		for (const bad of ['short', 'has spaces in it!!', 'x'.repeat(40), 12, null, "a'; DROP TABLE x"]) expect(chatSayId(bad)).toBeNull();
		expect(chatAuthor({ id: 'owner', name: 'Casey', via: 'indieauth', owner: true })).toEqual({ id: 'owner', name: 'Casey', via: 'owner' });
	});

	test('Micropub output never becomes a public link', () => {
		const messages = projectMessages([
			say('m1', 'Draft a note'),
			answer('e2', [{ type: 'toolCall', id: 'c1', name: 'micropub_create_post', arguments: { content: 'x' } }]),
			result('e3', 'c1', 'micropub_create_post', 'Location: https://caseyagollan.com/private-draft')
		]);
		expect(messages[1].tools).toEqual([{ tool: 'micropub_create_post', label: 'Saved a draft', status: 'done', at: 0 }]);
		// Nor do a private tool's results, or what a post says, go in the step's details.
		const saves = projectMessages([
			say('m1', 'What did I save?'),
			answer('e2', [{ type: 'toolCall', id: 'c1', name: 'my_saves', arguments: { source: 'arena', query: 'maps' } }, { type: 'toolCall', id: 'c2', name: 'micropub_update_post', arguments: { url: 'https://caseyagollan.com/a', replace: { content: ['secret'] } } }]),
			result('e3', 'c1', 'my_saves', '{"items":[{"title":"Private map","private":true}]}'),
			result('e4', 'c2', 'micropub_update_post', 'Updated')
		]);
		expect(saves[1].tools![0]).toMatchObject({ request: [{ name: 'Source', value: 'arena' }, { name: 'Query', value: 'maps' }] });
		expect(saves[1].tools![0].response).toBeUndefined();
		expect(saves[1].tools![1].request).toEqual([{ name: 'Url', value: 'https://caseyagollan.com/a' }]);
		expect(JSON.stringify(saves[1].tools)).not.toContain('secret');
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
		// A step under way after some text is the newest thing happening.
		expect(latestAssistantLine([ask, reply('Let me look.', { status: 'streaming', tools: [{ ...step, status: 'running' }] })])?.text).toMatch(/…$/);
		expect(latestAssistantLine([ask, reply('Let me look.', { status: 'streaming', tools: [{ ...step, status: 'done' }] })])?.text).toBe('Let me look.');
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

describe('what Casey has selected on a table', () => {
	test('a selection is cleaned up: ids, kinds and a few words, no repeats', () => {
		expect(chatSelection([{ id: 'shape:b1', type: 'post', title: '  Writing\n again ' }, { id: 'b1', type: 'post' }, { id: 'n 1' }, { id: 'n2', type: 'note', title: 3 }, null])).toEqual({ count: 2, items: [{ id: 'b1', type: 'post', title: 'Writing again' }, { id: 'n2', type: 'note' }] });
		expect(chatSelection([])).toBeNull();
		expect(chatSelection('b1')).toBeNull();
		expect(chatSelection(Array.from({ length: 150 }, (_, index) => ({ id: `s${index}`, type: 'note' })))?.count).toBe(100);
	});

	test('the model reads it before the message, with ids to act on', () => {
		const who = 'Casey Gollan (Casey, the site’s owner)';
		const page = { path: '/tables/abc123', title: 'Scratch', table: 'abc123' };
		expect(sayPrefix(who, 'https://caseyagollan.com/', page)).toBe('Casey Gollan (Casey, the site’s owner) wrote while on https://caseyagollan.com/tables/abc123 (“Scratch”), a table:');
		expect(sayPrefix(who, 'https://caseyagollan.com/', page, chatSelection([{ id: 'b1', type: 'post', title: 'Writing again' }, { id: 'n1', type: 'note' }])))
			.toBe('Casey Gollan (Casey, the site’s owner) wrote while on https://caseyagollan.com/tables/abc123 (“Scratch”), a table, with 2 things selected on the table (b1 (post “Writing again”), n1 (note)):');
		const many = sayPrefix(who, 'https://caseyagollan.com/', page, chatSelection(Array.from({ length: 80 }, (_, index) => ({ id: `s${index}`, type: 'note' }))));
		expect(many).toContain('with 80 things selected');
		expect(many).toContain('s59 (note), and 20 more');
		expect(sayPrefix('Ana', 'https://caseyagollan.com/')).toBe('Ana wrote:');
	});

	test('a message keeps what was selected when it was written', () => {
		const { projectMessages, SAY_KIND } = require('../src/lib/server/chat/projection') as typeof import('../src/lib/server/chat/projection');
		const casey = { id: 'owner', name: 'Casey', via: 'owner' as const };
		const selection = { count: 2, items: [{ id: 'b1', type: 'post', title: 'Writing again' }, { id: 'n1', type: 'note' }] };
		const messages = projectMessages([
			{ id: 'e1', kind: SAY_KIND, data: { id: 'm1', author: casey, owner: true, at: 1000, text: 'Frame these', selection } },
			{ id: 'e2', kind: SAY_KIND, data: { id: 'm2', author: casey, owner: true, at: 2000, text: 'Thanks' } }
		], {}, 3000);
		expect(messages[0].selection).toEqual(selection);
		expect(messages[1].selection).toBeUndefined();
	});
});

describe('go_to a table', () => {
	test('waits for the table to open, so the same answer can fill it', async () => {
		const { chatExtension } = await import('../src/lib/server/chat/tools');
		const opened: string[] = [];
		const thread = {
			table: () => undefined, tableOp: async () => ({}), readTable: async () => ({}), createTable: async () => ({ id: 'x', url: '/tables/x' }),
			navigate: async () => true,
			tableOpened: async (id: string) => { opened.push(id); return id === 'abc123'; }
		};
		const extension = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', thread });
		const goTo = extension.tools!.find((tool) => tool.name === 'go_to')!;
		const run = async (path: string) => JSON.parse(((await goTo.execute({ path }, {} as never, {} as never)) as { output: { text: string }[] }).output[0].text);
		expect((await run('/tables/abc123')).table).toContain('Open beside the chat');
		expect((await run('https://caseyagollan.com/tables/zzz999/')).table).toContain('Still opening');
		expect(await run('/library')).toEqual({ path: '/library' });
		expect(opened).toEqual(['abc123', 'zzz999']);
	});
});

describe('RepeatGuard', () => {
	test('refuses a third identical call, and a change to the table lets reads start over', async () => {
		const { RepeatGuard } = await import('../src/lib/server/chat/tools');
		const guard = new RepeatGuard();
		expect(guard.check('table_read', {})).toBeUndefined();
		expect(guard.check('table_read', {})).toBeUndefined();
		expect(guard.check('table_read', {})).toContain('Don’t read it again');
		expect(guard.check('table_add', { items: [{ note: 'a' }] })).toBeUndefined();
		expect(guard.check('table_read', {})).toBeUndefined();
		expect(guard.check('fetch_page', { url: '/' })).toBeUndefined();
		expect(guard.check('fetch_page', { url: '/' })).toBeUndefined();
		expect(guard.check('fetch_page', { url: '/' })).toContain('exactly these arguments');
		guard.reset();
		expect(guard.check('fetch_page', { url: '/' })).toBeUndefined();
	});
});

describe('go_to only goes to real pages', () => {
	test('resolves section names and refuses pages the site doesn’t have', async () => {
		const { realSitePath } = await import('../src/lib/server/chat/tools');
		const built = new Set(['/about/', '/2025/12/09/post/']);
		const assets = { fetch: async (request: Request) => new Response(null, { status: built.has(new URL(request.url).pathname) ? 200 : 404 }) } as unknown as Fetcher;
		const origin = 'https://caseyagollan.com/';
		expect(await realSitePath('/notes', origin, assets)).toBe('/type/notes');
		expect(await realSitePath('/Note/', origin, assets)).toBe('/type/notes');
		expect(await realSitePath('/books', origin, assets)).toBe('/library');
		expect(await realSitePath('/tables/abc123', origin, assets)).toBe('/tables/abc123');
		expect(await realSitePath('/2025/12/09/post/', origin, assets)).toBe('/2025/12/09/post/');
		expect(await realSitePath('/made-up-page', origin, assets)).toBeNull();
		expect(await realSitePath('/', origin, assets)).toBe('/');
	});
});

describe('search_site finds and browses', () => {
	const doc = (url: string, type: string, date: string | undefined, text: string, tags = '') => agentSearchDocument(url, `${type} ${date ?? ''}`.trim(), type, { ...(date ? { date } : {}), tags }, `<p>${text}</p>`);
	const docs = [
		doc('/2026/11/24/like-a/', 'like', '2026-11-24', 'A liked post about paperwork'),
		doc('/2026/11/23/like-b/', 'like', '2026-11-23', 'Another liked post'),
		doc('/2026/11/20/repost/', 'repost', '2026-11-20', 'A reposted post'),
		doc('/2026/11/17/writing-again/', 'note', '2026-11-17', 'Writing and sharing a bit again here', 'indieweb'),
		doc('/2026/11/17/photo/', 'photo', '2026-11-17', 'A photo of a letter'),
		doc('/2026/10/02/older/', 'article', '2026-10-02', 'An older article about paperwork', 'indieweb, micropub'),
		doc('/library/1', 'book', undefined, 'A book about paperwork'),
		doc('/wiki/tools', 'wiki', undefined, 'Calm tools')
	];

	test('without words it lists a range by date, own posts first, with a count of each kind', () => {
		const found = findDocuments(docs, { since: '2026-11-15' });
		expect(found.total).toBe(5);
		expect(found.by_type).toEqual({ like: 2, repost: 1, note: 1, photo: 1 });
		expect(found.results.map((result) => result.type)).toEqual(['note', 'photo', 'like', 'like', 'repost']);
		expect(found.results[0]).toMatchObject({ url: '/2026/11/17/writing-again/', date: '2026-11-17', text: 'Writing and sharing a bit again here' });
	});

	test('a week of only likes still says when Casey last posted', () => {
		const found = findDocuments(docs, { since: '2026-11-18' });
		expect(found.by_type).toEqual({ like: 2, repost: 1 });
		expect(found.note).toContain('None of Casey’s own posts fall in these dates');
		expect(found.note).toContain('/2026/11/17/writing-again/');
		// Asking only for likes isn't asking about Casey's own posts.
		expect(findDocuments(docs, { since: '2026-11-18', type: 'like' }).note).toBeUndefined();
	});

	test('`post` means Casey’s own posts; dates leave out what has none', () => {
		expect(findDocuments(docs, { type: 'post' }).results.map((result) => result.type)).toEqual(['note', 'photo', 'article']);
		expect(findDocuments(docs, { type: 'notes' }).total).toBe(1);
		expect(findDocuments(docs, { until: '2026-10-31' }).results.map((result) => result.url)).toEqual(['/2026/10/02/older/']);
		expect(findDocuments(docs, { tag: 'Micropub' }).total).toBe(1);
	});

	test('with words it searches within the range and counts every match', () => {
		const found = findDocuments(docs, { query: 'paperwork' });
		expect(found.total).toBe(3);
		expect(found.by_type).toEqual({ like: 1, article: 1, book: 1 });
		expect(findDocuments(docs, { query: 'paperwork', since: '2026-11-01' }).results.map((result) => result.url)).toEqual(['/2026/11/24/like-a/']);
		expect(findDocuments(docs, { query: 'nothing here' })).toMatchObject({ total: 0, results: [] });
		expect(findDocuments(docs, { query: 'paperwork', limit: 1 }).note).toContain('Showing 1 of 3');
	});

	test('an Are.na channel says it is one', () => {
		const channel = agentSearchDocument('https://www.are.na/casey-gollan/calm', 'Calm', 'arena', { date: '2026-11-23', kind: 'channel' }, '<p>Research</p>');
		expect(channel.k).toBe('channel');
		expect(findDocuments([channel], { query: 'calm' }).results[0]).toMatchObject({ type: 'arena', kind: 'channel' });
		expect(findDocuments([channel], { query: 'calm' }).note).toContain('everything that matched');
		expect(docs.every((one) => one.k === undefined)).toBe(true);
	});

	test('dates are the site’s own days', () => {
		expect(localDate(new Date('2026-11-26T03:30:00Z'), 'America/New_York')).toBe('2026-11-25');
		expect(daysBefore('2026-11-25', 7)).toBe('2026-11-18');
		expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
	});
});

describe('the chat’s tools', () => {
	const index = [
		agentSearchDocument('/2026/11/24/like-a/', 'Post by Someone', 'like', { date: '2026-11-24' }, '<p>A liked post</p>'),
		agentSearchDocument('/2026/11/17/writing-again/', 'Note · 2026-11-17', 'note', { date: '2026-11-17' }, '<p>Writing again</p>')
	];
	const long = `<html><head><title>Long</title></head><body><article><h1>Long</h1>${Array.from({ length: 400 }, (_, n) => `<p>Paragraph ${n} of a long page, with enough words in it to take up some room.</p>`).join('')}</article></body></html>`;
	const assets = { fetch: async (request: Request) => {
		const path = new URL(request.url).pathname;
		if (path === '/pagefind/agent-index.json') return Response.json(index);
		if (path === '/long/') return new Response(long, { headers: { 'content-type': 'text/html' } });
		return new Response('<html><head><title>Here</title></head><body><article><h1>Here</h1><p>The page Casey is on.</p></article></body></html>', { headers: { 'content-type': 'text/html' } });
	} } as unknown as Fetcher;
	const out = async (tool: { execute: (...args: never[]) => unknown }, args: unknown) => ((await (tool.execute as (args: unknown, api: unknown, context: unknown) => Promise<{ output: { text: string }[] }>)(args, {}, {})).output[0].text);

	async function setup(options: { ops?: unknown[]; table?: string; micropub?: MicropubCall; items?: () => unknown[]; selected?: string[]; asked?: string[]; pieces?: (op: { block: string }) => unknown; savesFetch?: typeof fetch; pdf?: (op: { url: string; from?: number; count?: number }) => unknown; env?: Record<string, unknown>; renderFetch?: typeof fetch } = {}) {
		const { chatExtension } = await import('../src/lib/server/chat/tools');
		const went: string[] = [];
		const ops = options.ops ?? [];
		let made = 0;
		const thread = {
			table: () => options.table,
			tableOp: async (op: { op: string; notes?: unknown[]; urls?: string[]; ids?: string[]; blocks?: unknown[] }) => {
				ops.push(op);
				if (op.op === 'read') return { items: options.items?.() ?? [], selected: options.selected ?? [] };
				if (op.op === 'add_notes') return { added: op.notes!.map(() => `n${++made}`), layout: 'no overlaps' };
				if (op.op === 'add_links') return { added: op.urls!.map(() => `b${++made}`) };
				if (op.op === 'add_from_search') return { added: [{ id: `b${++made}`, title: 'Found', url: '/x' }] };
				if (op.op === 'frame') return { added: ['f1'], holds: op.ids };
				if (op.op === 'add_pieces') return options.pieces?.(op as never) ?? { added: [] };
				if (op.op === 'add_pdf_pages') return options.pdf?.(op as never) ?? { added: [] };
				if (op.op === 'add_blocks') return { added: op.blocks!.map(() => `k${++made}`) };
				return { layout: 'no overlaps' };
			},
			readTable: async () => ({ items: options.items?.() ?? [] }),
			createTable: async () => ({ id: 'new123', url: '/tables/new123' }),
			navigate: async (path: string) => { went.push(path); return true; },
			tableOpened: async () => true,
			page: () => ({ path: '/2026/11/17/writing-again/' }),
			// What Casey had selected when writing the message being answered.
			selection: () => options.asked ?? []
		};
		const extension = chatExtension({ env: { ASSETS: assets, ...options.env } as never, origin: () => 'https://caseyagollan.com/', thread, micropub: options.micropub, savesFetch: options.savesFetch, renderFetch: options.renderFetch, now: () => new Date('2026-11-25T20:00:00Z'), maxTurns: 8 });
		const tool = (name: string) => extension.tools!.find((one) => one.name === name)!;
		return { extension, tool, went, ops };
	}

	test('there are few of them, each described briefly', async () => {
		const { extension } = await setup({ micropub: async () => Response.json({}) });
		const names = extension.tools!.map((tool) => tool.name);
		expect(names).toEqual(['search_site', 'fetch_page', 'view_image', 'show_page', 'go_to', 'my_saves', 'use_skill', 'skill_find', 'skill_add', 'micropub_list_posts', 'micropub_get_post', 'micropub_create_post', 'micropub_update_post', 'table_new', 'table_read', 'table_add', 'table_pull', 'table_render', 'table_arrange', 'table_move', 'table_connect', 'table_group', 'table_edit', 'table_draw', 'table_select', 'table_tag', 'table_look']);
		for (const tool of extension.tools!) expect(tool.description.length).toBeLessThan(700);
		// The whole of what the model is sent before a word is said: the prompt and every tool's schema.
		const prompt = (await Promise.all(extension.sections!.map((section) => section.render({} as never, {} as never)))).filter(Boolean).join('\n\n');
		// 26,000 before skills; their three tools (Casey's runs only) are some 1,650 characters of schema.
		expect(prompt.length + JSON.stringify(extension.tools!.map(({ name, description, parameters }) => ({ name, description, parameters }))).length).toBeLessThan(27_600);
		const skills = extension.tools!.filter((tool) => ['use_skill', 'skill_find', 'skill_add'].includes(tool.name));
		expect(JSON.stringify(skills.map(({ name, description, parameters }) => ({ name, description, parameters }))).length).toBeLessThan(1_700);
	});

	test('the prompt lists what is on the open table, as it stands at each step', async () => {
		const items = [{ id: 'n1', type: 'note', text: 'Deep listening', x: 0, y: 0, w: 200, h: 200 }];
		const { extension } = await setup({ table: 'abc123', items: () => items, asked: ['n1'] });
		const now = extension.sections!.find((section) => section.key === 'table-now')!;
		expect(await now.render({} as never, {} as never)).toContain('n1 note “Deep listening” at 0,0 200×200 (selected)');
		items.push({ id: 'n2', type: 'note', text: 'Sonic meditations', x: 220, y: 0, w: 200, h: 200 });
		expect(await now.render({} as never, {} as never)).toContain('n2 note “Sonic meditations”');
		// The last section, so the unchanging instructions above it stay the same from step to step.
		expect(extension.sections!.at(-1)).toBe(now);
		const none = await setup({});
		expect(await none.extension.sections!.find((section) => section.key === 'table-now')!.render({} as never, {} as never)).toBeUndefined();
	});

	test('the prompt says what day it is and where things are', async () => {
		const { extension } = await setup();
		const site = await extension.sections!.find((section) => section.key === 'site')!.render({} as never, {} as never);
		expect(site).toContain('Today is Wednesday, 2026-11-25. A week ago was 2026-11-18');
		expect(site).toContain('Notes /type/notes');
	});

	test('search_site lists the last days without words', async () => {
		const { tool } = await setup();
		const found = JSON.parse(await out(tool('search_site'), { days: 7 }));
		expect(found).toMatchObject({ dates: '2026-11-18 to 2026-11-25', total: 1, by_type: { like: 1 } });
		expect(found.results[0].url).toBe('https://caseyagollan.com/2026/11/24/like-a/');
		expect(found.note).toContain('https://caseyagollan.com/2026/11/17/writing-again/'.replace('https://caseyagollan.com', ''));
	});

	test('fetch_page reads the asker’s page when given none, and long pages a part at a time', async () => {
		const { tool } = await setup();
		expect(await out(tool('fetch_page'), {})).toContain('The page Casey is on.');
		const first = await out(tool('fetch_page'), { url: '/long/' });
		expect(first.length).toBeLessThan(8_600);
		const next = Number(/from=(\d+)/.exec(first)?.[1]);
		expect(next).toBe(8_000);
		const second = await out(tool('fetch_page'), { url: '/long/', from: next });
		expect(second).toContain('[Continuing from character 8000.]');
		expect(second).not.toContain('Paragraph 0 of');
	});

	test('the post list is a line per post, and looks back for drafts itself', async () => {
		const asked: string[] = [];
		const post = (n: number, draft = false) => ({ type: ['h-entry'], properties: { url: [`https://caseyagollan.com/2026/11/${String(n).padStart(2, '0')}/p/`], published: [`2026-11-${String(n).padStart(2, '0')}T10:00:00-05:00`], content: ['x'.repeat(5000)], ...(draft ? { 'post-status': ['draft'] } : {}) } });
		const micropub: MicropubCall = async (query) => {
			asked.push(query);
			const after = new URLSearchParams(query.slice(1)).get('after');
			return Response.json(after ? { items: [post(2, true)] } : { items: [post(20), post(19)], paging: { after: 'next' } });
		};
		const { tool } = await setup({ micropub });
		const listed = JSON.parse(await out(tool('micropub_list_posts'), {}));
		expect(listed.posts).toHaveLength(2);
		expect(listed.posts[0]).toEqual({ url: 'https://caseyagollan.com/2026/11/20/p/', status: 'published', type: 'note', date: '2026-11-20', text: `${'x'.repeat(160)}…` });
		expect(asked[0]).toContain('properties%5B%5D=content');
		const drafts = JSON.parse(await out(tool('micropub_list_posts'), { drafts_only: true }));
		expect(drafts.posts.map((line: { status: string }) => line.status)).toEqual(['draft']);
		expect(drafts.looked_through).toBe('the 3 newest posts, back to 2026-11-02');
		expect(asked.at(-1)).toContain('after=next');
	});

	test('table_add puts a whole comparison on the table in one change', async () => {
		const ops: { op: string }[] = [];
		const { tool } = await setup({ table: 'abc123', ops, items: () => [1, 2, 3, 4, 5, 6].map((n) => ({ id: `n${n}`, type: 'note', text: `Cell ${n}`, x: n * 220, y: 0, w: 200, h: 200 })) });
		const done = JSON.parse(await out(tool('table_add'), { items: [1, 2, 3, 4, 5, 6].map((n) => ({ note: `Cell ${n}` })), columns: 3, frame: 'Compared' }));
		expect(ops.map((op) => op.op)).toEqual(['add_notes', 'frame', 'read']);
		expect(ops[0]).toMatchObject({ columns: 3, notes: [{ text: 'Cell 1', style: 'note' }, {}, {}, {}, {}, {}] });
		expect(done).toMatchObject({ added: 6, frame: 'f1', on_table: 6 });
		expect(done.items[0]).toEqual({ id: 'n1', type: 'note', text: 'Cell 1', x: 220, y: 0, w: 200, h: 200 });
		expect(done.issues).toBeUndefined();
	});

	test('a mix of notes, links and search results is arranged together', async () => {
		const ops: { op: string; ids?: string[]; below?: string }[] = [];
		const { tool } = await setup({ table: 'abc123', ops });
		await out(tool('table_add'), { items: [{ search: 'oliveros', limit: 3 }, { url: '/library/1' }, { text: 'Why these belong together.' }], layout: 'row', below: 'n9' });
		expect(ops.map((op) => op.op)).toEqual(['add_from_search', 'add_links', 'add_notes', 'arrange', 'read']);
		expect(ops[3]).toMatchObject({ layout: 'row', ids: ['b1', 'b2', 'n3'], below: 'n9' });
	});

	test('an item is its first property with words in it, whatever else the model filled in', async () => {
		const ops: { op: string; notes?: unknown[]; urls?: string[] }[] = [];
		const { tool } = await setup({ table: 'abc123', ops });
		await out(tool('table_add'), { items: [{ note: 'Micropub', text: '', w: 240 }, { note: 'ignored', url: '/library/1', search: 'also ignored' }, { text: 'A paragraph.', note: '' }] });
		expect(ops.map((op) => op.op)).toEqual(['add_links', 'add_notes', 'arrange', 'read']);
		expect(ops[0].urls).toEqual(['https://caseyagollan.com/library/1']);
		expect(ops[1].notes).toEqual([{ text: 'Micropub', style: 'note' }, { text: 'A paragraph.', style: 'text' }]);
		expect(out(tool('table_add'), { items: [{ note: '' }] })).rejects.toThrow('Nothing was added');
	});

	test('a post on this site is sent with the words its search finds it by, for a rich block', async () => {
		const ops: { op: string; urls?: string[]; find?: Record<string, string[]> }[] = [];
		const { tool } = await setup({ table: 'abc123', ops });
		await out(tool('table_add'), { items: [{ url: '/2026/11/24/like-a' }, { url: 'https://example.com/elsewhere' }] });
		expect(ops[0].urls).toEqual(['https://caseyagollan.com/2026/11/24/like-a', 'https://example.com/elsewhere']);
		expect(ops[0].find).toEqual({ 'https://caseyagollan.com/2026/11/24/like-a': ['Post by Someone', 'A liked post'] });
	});

	test('table_pull sets each block’s pictures and quotes in open space beside it, a line from the block to each', async () => {
		const ops: { op: string; block?: string; ids?: string[]; at?: { x: number; y: number }; links?: unknown[]; columns?: number; images?: boolean; quotes?: boolean }[] = [];
		const table: Record<string, unknown>[] = [
			{ id: 'b1', type: 'post', title: 'Writing again', url: '/2026/11/17/writing-again/', x: 0, y: 0, w: 240, h: 240 },
			// In the way of where b1's pieces would go.
			{ id: 'b2', type: 'link', title: 'Calm technology', url: 'https://calmtech.com/', x: 400, y: 100, w: 240, h: 240 },
			{ id: 'b3', type: 'book', title: 'Deep Listening', url: '/library/1', x: 0, y: 800, w: 180, h: 300 }
		];
		const land = (pieces: { id: string; kind: string; text: string }[], near: { x: number; y: number }) => { for (const piece of pieces) table.push({ id: piece.id, type: piece.kind, title: 'x', url: `/x#${piece.id}`, x: near.x, y: near.y, w: 240, h: 240 }); };
		const pieces = (op: { block: string }) => {
			if (op.block === 'b3') return { source: 'Deep Listening', added: [], note: 'Books have no page to take pictures or quotes from.' };
			const added = op.block === 'b1'
				? [{ id: 'p1', kind: 'image', text: 'A photo' }, { id: 'p2', kind: 'quote', text: 'I re-built this site on IndieWeb protocols!' }]
				: [{ id: 'p3', kind: 'quote', text: 'Technology should require the smallest possible amount of attention.' }];
			land(added, { x: 260, y: 0 });
			return { added, more: op.block === 'b1' ? { images: 0, quotes: 2 } : { images: 0, quotes: 0 } };
		};
		const { tool } = await setup({ table: 'abc123', ops, items: () => table, selected: ['b1', 'b2', 'b3'], pieces });
		const done = JSON.parse(await out(tool('table_pull'), {}));
		// No frame, and no tidy: nothing that was there is moved.
		expect(ops.map((op) => op.op)).toEqual(['read', 'add_pieces', 'read', 'arrange', 'add_pieces', 'read', 'arrange', 'add_pieces', 'connect', 'read']);
		expect(ops[1]).toMatchObject({ block: 'b1', images: true, quotes: true });
		// 500 wide and 240 tall, the nearest place right of b1 (340, 0) that clears b2.
		const spot = ops[3].at!;
		expect(ops[3]).toMatchObject({ layout: 'grid', ids: ['p1', 'p2'], columns: 2 });
		expect(spot.x < 400 + 240 + 20 && spot.x + 500 + 20 > 400 && spot.y < 100 + 240 + 20 && spot.y + 240 + 20 > 100).toBe(false);
		expect(Math.abs(spot.x - 340) + Math.abs(spot.y)).toBeLessThanOrEqual(400);
		expect(ops[8].links).toEqual([{ from: 'b1', to: 'p1' }, { from: 'b1', to: 'p2' }, { from: 'b2', to: 'p3' }]);
		expect(done.added).toBe(3);
		expect(done.issues).toBeUndefined();
		expect(done.pulled).toEqual([
			{ from: 'b1', title: 'Writing again', pictures: 1, quotes: ['I re-built this site on IndieWeb protocols!'], left_out: { images: 0, quotes: 2 } },
			{ from: 'b2', title: 'Calm technology', pictures: 0, quotes: ['Technology should require the smallest possible amount of…'] },
			{ from: 'b3', title: 'Deep Listening', pictures: 0, quotes: [], note: 'Books have no page to take pictures or quotes from.' }
		]);
	});

	test('an Are.na channel or block is pulled through Are.na, never from its web page', async () => {
		const asked: string[] = [];
		const savesFetch = (async (input: RequestInfo | URL) => {
			const url = String(input instanceof Request ? input.url : input);
			asked.push(url);
			if (url.includes('/channels/index-of-calm-technologies/contents')) return Response.json({ data: [
				{ id: 1, type: 'Image', title: 'Tea kettle', image: { src: 'https://d2w9rnfcy7mm78.cloudfront.net/1/kettle.jpg' }, visibility: 'public' },
				{ id: 2, type: 'Text', title: '', content: { plain: 'If a technology works well, we can ignore it most of the time.' }, visibility: 'public' },
				{ id: 3, type: 'Channel', title: 'Nested', slug: 'nested', visibility: 'public' }
			], meta: { total_count: 3, has_more_pages: false } });
			if (url.includes('/channels/index-of-calm-technologies')) return Response.json({ id: 9, type: 'Channel', slug: 'index-of-calm-technologies', title: 'Index of Calm Technologies', owner: { slug: 'casey-gollan' }, visibility: 'public' });
			if (url.includes('/blocks/77/connections')) return Response.json({ data: [], meta: {} });
			if (url.includes('/blocks/77')) return Response.json({ id: 77, type: 'Link', title: 'Glow', source: { url: 'https://macwright.org/glow' }, description: { plain: 'A road in technology not taken.' }, visibility: 'public' });
			if (url.startsWith('https://macwright.org/glow')) return new Response('<html><head><title>Glow</title></head><body><article><h1>Glow</h1><p>The glow was a way for a device to say something without asking for anything back.</p><img src="/glow.jpg" width="800" alt="An orb"></article></body></html>', { headers: { 'content-type': 'text/html' } });
			return new Response('{}', { status: 404 });
		}) as typeof fetch;
		const ops: { op: string; blocks?: { kind: string; url: string; title: string; excerpt?: string; image?: string }[] }[] = [];
		const table = [
			{ id: 'c1', type: 'arena', title: 'Index of Calm Technologies', url: 'https://www.are.na/casey-gollan/index-of-calm-technologies', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'a1', type: 'arena', title: 'Glow', url: 'https://www.are.na/block/77', x: 0, y: 600, w: 240, h: 240 }
		];
		const { tool } = await setup({ table: 'abc123', ops, items: () => table, selected: ['c1', 'a1'], savesFetch });
		const done = JSON.parse(await out(tool('table_pull'), {}));
		expect(ops.some((op) => op.op === 'add_pieces')).toBe(false);
		expect(asked.some((url) => url.startsWith('https://www.are.na/'))).toBe(false);
		const [channel, block] = ops.filter((op) => op.op === 'add_blocks');
		// The channel's blocks: its picture, and its text as a quote; the channel inside it is left.
		expect(channel.blocks).toMatchObject([
			{ kind: 'image', url: 'https://www.are.na/block/1', title: 'Tea kettle', image: 'https://d2w9rnfcy7mm78.cloudfront.net/1/kettle.jpg' },
			{ kind: 'quote', url: expect.stringMatching(/^https:\/\/www\.are\.na\/block\/2#:~:text=If/), title: 'Index of Calm Technologies', excerpt: 'If a technology works well, we can ignore it most of the time.' }
		]);
		// A saved link: its own description, then the page it links to.
		expect(block.blocks!.map((one) => one.kind)).toEqual(['quote', 'quote', 'image']);
		expect(block.blocks![1]).toMatchObject({ title: 'Glow', excerpt: expect.stringContaining('without asking for anything back') });
		expect(block.blocks![2]).toMatchObject({ image: 'https://macwright.org/glow.jpg' });
		expect(done.added).toBe(5);
	});

	test('table_render puts a PDF’s pages in a frame beside its block, joined to it, and says what is left', async () => {
		const ops: { op: string; url?: string; from?: number; count?: number; block?: string; ids?: string[]; at?: unknown; columns?: number; name?: string; links?: unknown[] }[] = [];
		const blocks = [{ id: 'b1', type: 'link', title: 'Attention Is All You Need', url: 'https://example.com/papers/attention.pdf', x: 0, y: 0, w: 240, h: 240 }];
		const pdf = (op: { from?: number; count?: number }) => ({ added: Array.from({ length: op.count ?? 12 }, (_, index) => ({ id: `p${index + 1}`, page: (op.from ?? 1) + index })), pages: 15, drawn: op.count });
		const { tool } = await setup({ table: 'abc123', ops, items: () => blocks, asked: ['b1'], pdf });
		const done = JSON.parse(await out(tool('table_render'), {}));
		expect(ops.map((op) => op.op)).toEqual(['read', 'add_pdf_pages', 'arrange', 'frame', 'tidy', 'connect', 'read']);
		expect(ops[1]).toMatchObject({ url: 'https://example.com/papers/attention.pdf', title: 'Attention Is All You Need', from: 1, count: 12, block: 'b1' });
		expect(ops[2]).toMatchObject({ layout: 'grid', columns: 4, ordered: true, at: { x: 380, y: 40 } });
		expect(ops[3]).toMatchObject({ name: 'Pages of Attention Is All You Need' });
		expect(ops[5].links).toEqual([{ from: 'b1', to: 'f1' }]);
		expect(done.added).toBe(12);
		expect(done.rendered[0]).toMatchObject({ from: 'b1', kind: 'pdf', pages: '1-12', of: 15 });
		expect(done.rendered[0].more).toContain('pages "13-15"');
		// The rest, asked for by range.
		ops.length = 0;
		await out(tool('table_render'), { blocks: ['attention'], pages: '13-15' });
		expect(ops[1]).toMatchObject({ from: 13, count: 3 });
	});

	test('table_render screenshots a whole web page once, keeps it, and refuses addresses that aren’t public', async () => {
		const ops: { op: string; blocks?: { kind: string; url: string; image?: string; title: string }[]; sizes?: unknown[]; plain?: boolean; links?: unknown[] }[] = [];
		const kept = new Map<string, { size: number; customMetadata?: Record<string, string> }>();
		const SCREENSHOTS = { head: async (key: string) => kept.get(key) ?? null, put: async (key: string, body: ArrayBuffer, options: { customMetadata?: Record<string, string> }) => { kept.set(key, { size: body.byteLength, customMetadata: options.customMetadata }); } };
		const asked: { url: string; body?: { url: string; screenshotOptions: { fullPage: boolean } } }[] = [];
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 5400 >> 8, 5400 & 255, 1280 >> 8, 1280 & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
		const renderFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/browser-rendering/screenshot')) { asked.push({ url, body: JSON.parse(String(init?.body)) }); return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }); }
			if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
			return new Response('<html></html>', { headers: { 'content-type': 'text/html', 'content-length': '13' } });
		}) as typeof fetch;
		const blocks = [{ id: 'b1', type: 'link', title: 'Micropub', url: 'https://indieweb.org/Micropub', x: 0, y: 0, w: 240, h: 240 }];
		const { tool } = await setup({ table: 'abc123', ops, items: () => blocks, env: { SCREENSHOTS, CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'token' }, renderFetch });
		const done = JSON.parse(await out(tool('table_render'), { blocks: ['micropub'] }));
		expect(asked).toHaveLength(1);
		expect(asked[0].body).toMatchObject({ url: 'https://indieweb.org/Micropub', screenshotOptions: { fullPage: true } });
		const add = ops.find((op) => op.op === 'add_blocks')!;
		expect(add.blocks![0]).toMatchObject({ kind: 'image', url: 'https://indieweb.org/Micropub', title: 'Screenshot of Micropub', image: '/api/screenshot?url=https%3A%2F%2Findieweb.org%2FMicropub&full=1' });
		expect(add).toMatchObject({ sizes: [{ w: 480, h: 2025 }], plain: true, at: { x: 340, y: 0 } });
		expect(ops.find((op) => op.op === 'connect')!.links).toHaveLength(1);
		expect(done.rendered[0]).toMatchObject({ from: 'b1', kind: 'screenshot', picture: '1280×5400px' });
		// A second ask is served from what was kept; an address given under `urls` needs no block.
		const again = JSON.parse(await out(tool('table_render'), { urls: ['https://indieweb.org/Micropub'] }));
		expect(asked).toHaveLength(1);
		expect(again.rendered[0].kept_from_before).toBe(true);
		for (const address of ['http://indieweb.org/', 'https://localhost/admin', 'https://10.0.0.8/', 'https://router.internal/']) {
			const refused = JSON.parse(await out(tool('table_render'), { urls: [address] }));
			expect(refused.added).toBe(0);
			expect(refused.rendered[0].note).toBe('Only public https addresses can be rendered.');
		}
		expect(asked).toHaveLength(1);
		const { toolLabel } = await import('../src/lib/server/chat/projection');
		expect(toolLabel('table_render', {})).toBe('Rendered the selected blocks');
		expect(toolLabel('table_render', { urls: ['https://indieweb.org/Micropub'] })).toBe('Rendered indieweb.org/Micropub');
		expect(toolLabel('table_render', { blocks: ['b1'], pages: '13-24' })).toBe('Rendered 1 source, pages 13-24');
		const { isOwnerTool } = await import('../src/lib/server/chat/tools');
		expect(isOwnerTool('table_render')).toBe(true);
	});

	test('table_render says so where screenshots aren’t set up, and when nothing is selected', async () => {
		const blocks = [{ id: 'b1', type: 'link', title: 'Micropub', url: 'https://indieweb.org/Micropub', x: 0, y: 0, w: 240, h: 240 }];
		const renderFetch = (async (input: RequestInfo | URL) => String(input).startsWith('https://cloudflare-dns.com/') ? Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }) : new Response('x', { headers: { 'content-type': 'text/html', 'content-length': '1' } })) as typeof fetch;
		const { tool } = await setup({ table: 'abc123', items: () => blocks, env: { SCREENSHOTS: { head: async () => null } }, renderFetch });
		const done = JSON.parse(await out(tool('table_render'), { blocks: ['b1'] }));
		expect(done.added).toBe(0);
		expect(done.rendered[0].note).toContain('Screenshots aren’t set up here');
		expect(out(tool('table_render'), {})).rejects.toThrow('Casey has no blocks selected');
	});

	test('a context pull of the whole table reads every block but the pieces already pulled', async () => {
		const ops: { op: string; block?: string }[] = [];
		const blocks = [
			{ id: 'b1', type: 'post', title: 'One', url: '/1/', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'wiki', title: 'Two', url: 'https://cag.wiki/two', x: 0, y: 400, w: 240, h: 240 },
			{ id: 'q1', type: 'quote', title: 'One', url: '/1/#:~:text=x', x: 400, y: 0, w: 300, h: 140 },
			{ id: 'n1', type: 'note', text: 'A note', x: 0, y: 800, w: 200, h: 200 }
		];
		const { tool } = await setup({ table: 'abc123', ops, items: () => blocks, pieces: () => ({ added: [] }) });
		const done = JSON.parse(await out(tool('table_pull'), { blocks: ['all'] }));
		expect(ops.filter((op) => op.op === 'add_pieces').map((op) => op.block)).toEqual(['b1', 'b2']);
		expect(done.added).toBe(0);
		const { toolLabel } = await import('../src/lib/server/chat/projection');
		expect(toolLabel('table_pull', { blocks: ['all'] })).toBe('Context pull: pictures and quotes from the whole table');
		expect(toolLabel('table_pull', { blocks: ['b1'], images: false })).toBe('Context pull: quotes from 1 block');
		expect(toolLabel('table_pull', {})).toBe('Context pull: pictures and quotes from the selected blocks');
	});

	test('table_pull finds blocks by title words, and says which it couldn’t', async () => {
		const ops: { op: string; block?: string; quotes?: boolean; match?: string[] }[] = [];
		const blocks = [{ id: 'b1', type: 'link', title: 'Ursula K. Le Guin: The Carrier Bag Theory', url: 'https://example.com/carrier-bag', x: 0, y: 0, w: 240, h: 240 }];
		const { tool } = await setup({ table: 'abc123', ops, items: () => blocks, pieces: () => ({ added: [{ id: 'p1', kind: 'quote', text: 'A leaf a gourd a shell a net' }] }) });
		await out(tool('table_pull'), { blocks: ['le guin'], images: false, match: ['gourd'] });
		expect(ops[1]).toMatchObject({ op: 'add_pieces', block: 'b1', images: false, quotes: true, match: ['gourd'] });
		expect(out(tool('table_pull'), { blocks: ['oliveros'] })).rejects.toThrow('No block on the table matches “oliveros”. The blocks are: b1 “Ursula K. Le Guin: The Carrier Bag');
		expect(out(tool('table_pull'), {})).rejects.toThrow('Casey has no blocks selected');
	});

	test('“selected” in any tool’s ids means what Casey had selected when asking', async () => {
		const ops: Record<string, unknown>[] = [];
		const items = [
			{ id: 'b1', type: 'post', title: 'Writing again', url: '/a', text: 'I want to write here more often, in public, in small pieces, and this excerpt runs on well past a hundred characters so it gets cut.', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'book', title: 'Deep Listening', url: '/library/1', x: 300, y: 0, w: 180, h: 300 },
			{ id: 'n1', type: 'note', text: 'Attention', x: 600, y: 0, w: 200, h: 200 }
		];
		const { tool } = await setup({ table: 'abc123', ops, items: () => items, asked: ['b1', 'n1'] });
		await out(tool('table_arrange'), { layout: 'row', ids: ['selected'] });
		expect(ops[0]).toMatchObject({ op: 'arrange', layout: 'row', ids: ['b1', 'n1'] });
		// The graph layouts and clusters go to the canvas in one op, with the words a model reaches for understood.
		await out(tool('table_arrange'), { layout: 'flowchart', direction: 'right', root: 'selected', arrows: 'elbow' });
		expect(ops.at(-2)).toMatchObject({ op: 'arrange', layout: 'layered', direction: 'right', root: 'b1', arrows: 'elbow' });
		await out(tool('table_arrange'), { groups: [{ name: 'Reading', ids: ['selected'] }, { name: 'Empty', ids: [] }], inside: 'f1' });
		expect(ops.at(-2)).toMatchObject({ op: 'arrange', layout: 'cluster', inside: 'f1', groups: [{ name: 'Reading', ids: ['b1', 'n1'] }] });
		await out(tool('table_group'), { ids: ['selected', 'b2'], name: 'Reading' });
		expect(ops.find((op) => op.op === 'frame')).toMatchObject({ name: 'Reading', ids: ['b1', 'n1', 'b2'] });
		await out(tool('table_edit'), { edits: [{ id: 'selected', color: 'red' }], remove: ['selection'] });
		expect(ops.find((op) => op.op === 'edit')).toMatchObject({ edits: [{ id: 'b1', color: 'red' }, { id: 'n1', color: 'red' }] });
		expect(ops.find((op) => op.op === 'remove')).toMatchObject({ ids: ['b1', 'n1'] });
		await out(tool('table_draw'), { strokes: [{ around: 'selected', color: 'blue' }] });
		expect(ops.find((op) => op.op === 'draw')).toMatchObject({ strokes: [{ around: 'b1', color: 'blue' }, { around: 'n1', color: 'blue' }] });
		await out(tool('table_select'), { ids: ['these'] });
		expect(ops.find((op) => op.op === 'select')).toMatchObject({ ids: ['b1', 'n1'] });
		// Tags: the selection, or a frame's blocks, with the tags cleaned as Casey would type them.
		await out(tool('table_tag'), { ids: ['selected'], add: ['#IndieWeb, tables'], remove: ['misc'] });
		expect(ops.find((op) => op.op === 'tag')).toEqual({ op: 'tag', ids: ['b1', 'n1'], inside: undefined, add: ['IndieWeb', 'tables'], remove: ['misc'] });
		await out(tool('table_tag'), { inside: 'Reading' });
		expect(ops.filter((op) => op.op === 'tag')[1]).toEqual({ op: 'tag', inside: 'Reading' });
		await out(tool('table_add'), { items: [{ note: 'Next' }], below: 'selected' });
		expect(ops.find((op) => op.op === 'add_notes')).toMatchObject({ below: 'b1' });
		const { toolLabel } = await import('../src/lib/server/chat/projection');
		// Reading the selection: just those items, with all their words.
		const read = JSON.parse(await out(tool('table_read'), { ids: ['selected'] })) as { items: { id: string; text?: string }[] };
		expect(read.items.map((item) => item.id)).toEqual(['b1', 'n1']);
		expect(read.items[0].text).toEndWith('so it gets cut.');
		expect(toolLabel('table_read', { ids: ['selected'] })).toBe('Read the selected items');
		expect(toolLabel('table_arrange', { layout: 'row', ids: ['selected'] })).toBe('Arranged the selected items in a row');
		expect(toolLabel('table_edit', { edits: [{ id: 'selected', color: 'red' }] })).toBe('Edited the selected items');
	});

	test('with nothing selected, “selected” says so rather than acting on everything', async () => {
		const { tool } = await setup({ table: 'abc123' });
		expect(out(tool('table_edit'), { remove: ['selected'] })).rejects.toThrow('Casey had nothing selected on the table');
		expect(out(tool('table_arrange'), { layout: 'grid', ids: ['selected'] })).rejects.toThrow('Casey had nothing selected');
	});

	test('table_pull uses the selection Casey asked with, not what the run selected since', async () => {
		const ops: { op: string; block?: string }[] = [];
		const blocks = [{ id: 'b1', type: 'post', title: 'Writing again', url: '/a', x: 0, y: 0, w: 240, h: 240 }, { id: 'b2', type: 'link', title: 'Calm technology', url: 'https://calmtech.com/', x: 0, y: 400, w: 240, h: 240 }];
		const { tool } = await setup({ table: 'abc123', ops, items: () => blocks, selected: ['b2'], asked: ['b1'], pieces: () => ({ added: [{ id: 'p1', kind: 'quote', text: 'Small pieces' }] }) });
		await out(tool('table_pull'), {});
		expect(ops.filter((op) => op.op === 'add_pieces').map((op) => op.block)).toEqual(['b1']);
	});

	test('an empty item leaves a cell of a grid of notes open', async () => {
		const ops: { op: string; notes?: unknown[] }[] = [];
		const { tool } = await setup({ table: 'abc123', ops });
		await out(tool('table_add'), { items: [{}, { note: 'Micropub' }, { note: 'POSSE' }, { note: 'What it is' }, { text: 'An API.' }, { text: 'A practice.' }], columns: 3 });
		expect(ops[0]).toMatchObject({ op: 'add_notes', columns: 3 });
		expect(ops[0].notes).toEqual([{ text: '', blank: true }, { text: 'Micropub', style: 'note' }, { text: 'POSSE', style: 'note' }, { text: 'What it is', style: 'note' }, { text: 'An API.', style: 'text' }, { text: 'A practice.', style: 'text' }]);
	});

	test('table_new makes the table and opens it, and works with no table open', async () => {
		const { tool, went, extension } = await setup();
		const made = JSON.parse(await out(tool('table_new'), { name: 'Calm tech' }));
		expect(made).toMatchObject({ url: '/tables/new123', draft: true, on_table: 0 });
		expect(made.table).toContain('Open beside the chat');
		expect(went).toEqual(['/tables/new123']);
		const { isTableTool, isOwnerTool } = await import('../src/lib/server/chat/tools');
		expect(isTableTool('table_new')).toBe(false);
		expect(isOwnerTool('table_new')).toBe(true);
		expect(isOwnerTool('table_read')).toBe(false);
		expect(extension.tools!.filter((one) => one.name.startsWith('table_') && one.name !== 'table_read').every((one) => isOwnerTool(one.name))).toBe(true);
	});

	test('the last round of a run is asked without tools, so it ends in an answer', async () => {
		const { extension } = await setup();
		const hooks = extension.hooks as unknown as { handlers: { beforeProviderRequest?: (request: unknown, api: unknown, context: unknown) => Promise<{ payload: { tools?: unknown[]; reasoning_effort?: string; messages: { role: string; content: string }[] } } | undefined> } }[];
		const before = hooks.find((hook) => hook.handlers.beforeProviderRequest)!.handlers.beforeProviderRequest!;
		const payload = { model: 'm', tool_choice: 'auto', tools: [{ type: 'function', function: { name: 'search_site' } }], messages: [{ role: 'user', content: 'hi' }] };
		const at = (turns: number) => before({ payload }, { conversationId: 'c', snapshot: async () => ({ run: { turns } }), entries: async () => ({ items: [] }) }, {});
		// Every request says how hard to think; unset, the gateway's model thinks without limit.
		expect((await at(3))!.payload).toMatchObject({ reasoning_effort: 'low', tools: payload.tools });
		const last = (await at(7))!.payload;
		expect(last.tools).toBeUndefined();
		expect('tool_choice' in last).toBe(false);
		expect(last.messages.at(-1)!.content).toContain('Answer now from what you have');
		expect(payload.messages).toHaveLength(1);
	});
});
