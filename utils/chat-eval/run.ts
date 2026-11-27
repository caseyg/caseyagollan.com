/**
 * Replays questions against the /chat assistant's real prompt and tools, outside the Worker, to see
 * how the model uses them: steps, tokens, time, and the answer. Run it before and after a change
 * to the tools (`bun utils/chat-eval/run.ts`, optionally with scenario names) and compare.
 *
 * The site is read live from caseyagollan.com; Micropub is answered from the local content
 * folder; a table is a small in-memory stand-in; Are.na, Readwise and Raindrop are read live. Needs a gateway key in INFERENCE_COOP_API_KEY
 * (or CHAT_INFERENCE_URL pointing at a relay).
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { chatSelection, sayPrefix } from '../../src/lib/chat';
import { chatExtension, needsTable } from '../../src/lib/server/chat/tools';
import { callMicropubTool, MICROPUB_TOOLS, type MicropubCall } from '../../src/lib/server/chat/micropub-mcp';
import { invokedSkills, saveSkill } from '../../src/lib/server/chat/skills';
import { fakeTable } from './fake-table';
import { SCENARIOS, type Scenario } from './scenarios';

const ORIGIN = 'https://caseyagollan.com/';
const MODEL = process.env.CHAT_MODEL || 'glm-flash-green';
const BASE = process.env.CHAT_INFERENCE_URL || 'https://gateway.inference.coop/v1';
const MAX_TURNS = 8;
const NOW = process.env.CHAT_EVAL_NOW ? new Date(process.env.CHAT_EVAL_NOW) : new Date();

/**
 * Casey's saves are read live too: Are.na's public channels need no token; Readwise and Raindrop
 * answer only with READWISE_ACCESS_TOKEN and RAINDROP_TOKEN set, and say they aren't connected otherwise.
 */
const SAVES = { ARENA_PAT: process.env.ARENA_PAT, RAINDROP_TOKEN: process.env.RAINDROP_TOKEN, READWISE_ACCESS_TOKEN: process.env.READWISE_ACCESS_TOKEN };

/** The Worker's assets, stood in for by the live site. */
const assets = { fetch: (request: Request | string | URL) => fetch(new Request(request as Request, { redirect: 'follow' })) } as unknown as Fetcher;

/** Micropub's post list and sources, read from the content folder the way `q=source` answers. */
/**
 * table_render without Browser Rendering: addresses are still asked what they are, live, but a
 * screenshot is a made-up JPEG header (1280 wide, 5400 tall) kept in memory.
 */
const kept = new Map<string, { body: ArrayBuffer; customMetadata?: Record<string, string> }>();
const RENDER = {
	CLOUDFLARE_ACCOUNT_ID: 'eval', CLOUDFLARE_API_TOKEN: 'eval',
	SCREENSHOTS: {
		head: async (key: string) => { const found = kept.get(key); return found ? { size: found.body.byteLength, customMetadata: found.customMetadata } : null; },
		put: async (key: string, body: ArrayBuffer, options?: { customMetadata?: Record<string, string> }) => { kept.set(key, { body, customMetadata: options?.customMetadata }); }
	}
};
const renderFetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/browser-rendering/screenshot')
	? Promise.resolve(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 5400 >> 8, 5400 & 255, 1280 >> 8, 1280 & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } }))
	: fetch(input, init)) as typeof fetch;

async function contentMicropub(): Promise<MicropubCall> {
	const posts: { url: string; date: string; type: string; properties: Record<string, unknown[]> }[] = [];
	for (const folder of ['notes', 'articles', 'bookmarks', 'likes', 'photos', 'replies', 'reposts']) {
		for (const file of (await readdir(`content/${folder}`).catch(() => [])).filter((name) => name.endsWith('.md')).sort().slice(-80)) {
			const raw = await readFile(`content/${folder}/${file}`, 'utf8');
			const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
			if (!match) continue;
			const front = Bun.YAML.parse(match[1]) as Record<string, unknown>;
			const date = String(front.date instanceof Date ? front.date.toISOString() : front.date ?? '');
			const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
			const properties: Record<string, unknown[]> = { published: [date], ...(match[2].trim() ? { content: [match[2].trim()] } : {}) };
			for (const [key, value] of Object.entries(front)) if (key !== 'date' && !key.startsWith('_micropubContent')) properties[key.replace(/^_micropubSocialSnapshots$/, 'social-snapshot')] = Array.isArray(value) ? value : [value];
			posts.push({ url: `${ORIGIN}${date.slice(0, 10).replaceAll('-', '/')}/${slug}/`, date, type: folder.replace(/s$/, '').replace('replie', 'reply'), properties });
		}
	}
	posts.sort((a, b) => b.date.localeCompare(a.date));
	return async (query, init) => {
		if (init?.method === 'POST') return new Response(null, { status: 201, headers: { location: `${ORIGIN}drafts/eval-draft/` } });
		const params = new URLSearchParams(query.replace(/^\?/, ''));
		if (params.get('q') === 'config') return Response.json({ 'post-statuses': ['published', 'draft'] });
		const url = params.get('url');
		if (url) { const post = posts.find((item) => item.url === url || item.url === `${url}/`); return post ? Response.json({ type: ['h-entry'], properties: post.properties }) : Response.json({ error: 'not_found' }, { status: 404 }); }
		const type = params.get('post-type');
		const from = Number(params.get('after') ?? 0);
		const limit = Number(params.get('limit') ?? 10);
		const all = posts.filter((post) => !type || post.type === type);
		const items = all.slice(from, from + limit).map((post) => ({ type: ['h-entry'], properties: { ...post.properties, url: [post.url] } }));
		return Response.json({ items, ...(from + limit < all.length ? { paging: { after: String(from + limit) } } : {}) });
	};
}

interface Tool { name: string; description: string; parameters: Record<string, unknown>; execute(args: unknown): Promise<{ output: { type: string; text?: string; data?: string; mimeType?: string }[] }> }
interface Call { id: string; function: { name: string; arguments: string } }

async function complete(body: Record<string, unknown>) {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.INFERENCE_COOP_API_KEY ?? 'proxy'}` }, body: JSON.stringify(body) });
		if (response.ok) return await response.json() as { choices: { message: { content?: string | null; tool_calls?: Call[] } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
		if (attempt >= 3) throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
		await Bun.sleep(2000 * (attempt + 1));
	}
}

export interface Outcome { scenario: string; status: 'answered' | 'turn_limit'; rounds: number; calls: { round: number; name: string; args: string; chars: number; error?: boolean }[]; tokensIn: number; tokensOut: number; /** The largest single request, to compare with the chat's context window. */ peakTokens: number; seconds: number; answer: string; table?: unknown; checks: { name: string; pass: boolean }[] }

async function run(scenario: Scenario, micropub: MicropubCall): Promise<Outcome> {
	let table = scenario.table ? fakeTable(scenario.table, scenario.selected) : undefined;
	let tableId = table ? 'evaltable1' : undefined;
	let made: ReturnType<typeof fakeTable> | undefined;
	const went: string[] = [];
	const thread = {
		table: () => tableId,
		tableOp: async (op: unknown) => { if (!table) throw new Error('Casey doesn’t have this table open.'); return table.perform(op as never); },
		readTable: async () => table!.perform({ op: 'read' } as never),
		createTable: async (name: string) => { made = fakeTable([]); return { id: 'evalnew001', url: '/tables/evalnew001', name }; },
		// Going to the new table opens it beside the chat, as Casey's browser would.
		navigate: async (path: string) => { went.push(path); if (made && /^\/tables\/evalnew001/.test(path)) { table = made; tableId = 'evalnew001'; } return true; },
		tableOpened: async () => true,
		page: () => scenario.page ? { path: scenario.page } : undefined,
		// What Casey had selected when asking, as the thread remembers it from the message.
		selection: () => scenario.selected ?? []
	};
	// Casey's skills, kept in memory for the run: the built-in ones, plus any the scenario starts with.
	const kept = new Map<string, string>();
	const skillStore = { get: async (key: string) => kept.has(key) ? { json: async () => JSON.parse(kept.get(key)!) } : null, put: async (key: string, value: string) => { kept.set(key, value); }, delete: async (key: string) => { kept.delete(key); } } as unknown as R2Bucket;
	for (const skill of scenario.skills ?? []) await saveSkill(skillStore, skill);
	// GitHub's tree API refuses the sandbox this runs in, so a repository's listing is stood in for; the skills themselves are read live.
	const skillsFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const listing = /^https:\/\/api\.github\.com\/repos\/anthropics\/skills\/git\/trees\//.test(String(input));
		return listing ? Response.json({ tree: ['frontend-design', 'doc-coauthoring', 'internal-comms', 'brand-guidelines'].map((name) => ({ path: `skills/${name}/SKILL.md`, type: 'blob' })) }) : fetch(input, init);
	}) as typeof fetch;
	const extension = chatExtension({ env: { ASSETS: assets, ...SAVES, ...RENDER, PUBLISHING_STATE: skillStore, INFERENCE_COOP_API_KEY: process.env.INFERENCE_COOP_API_KEY, CHAT_INFERENCE_URL: process.env.CHAT_INFERENCE_URL } as never,
		// table_map keeps its stage files in the same stand-in; with nowhere to mirror pictures, its cards fall back to title tiles.
		mapOverrides: { pictures: undefined }, renderFetch, skillsFetch, origin: () => ORIGIN, onlyOwner: () => true, thread: thread as never, micropub, now: () => NOW, reasoningEffort: process.env.CHAT_REASONING_EFFORT } as never);
	// Before the redesign the extension took no Micropub stand-in: offer the bridge's own tools the way the Worker does.
	const names = new Set(extension.tools!.map((tool) => tool.name));
	const extra: Tool[] = [...names].some((name) => name.startsWith('micropub_')) ? [] : MICROPUB_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema, async execute(args: unknown) { const result = await callMicropubTool(micropub, tool.name, args as Record<string, unknown>); return { output: result.content }; } }));
	const plain = () => [...(extension.tools as unknown as Tool[]), ...extra].filter((tool) => tableId || !needsTable(tool.name));
	const offered = () => (process.env.CHAT_EVAL_VARIANT ?? '').split(',').includes('code') ? codeMode(plain()) : plain();
	const system = async () => (await Promise.all(extension.sections!.map((section) => section.render({} as never, {} as never)))).filter(Boolean).join('\n\n');
	// The same line the thread writes before each message: who, where, and what is selected on the table.
	const selection = scenario.table && scenario.selected?.length ? chatSelection(scenario.table.filter((item) => scenario.selected!.includes(item.id)).map((item) => ({ id: item.id, type: item.type, title: item.title ?? item.text }))) : null;
	const prefix = sayPrefix('Casey Gollan (Casey, the site’s owner)', ORIGIN, scenario.page ? { path: scenario.page, title: scenario.pageTitle, ...(scenario.table ? { table: 'evaltable1' } : {}) } : null, selection);
	// A message with /name in it carries that skill's instructions, as the thread sends it.
	const invoked = await invokedSkills(skillStore, scenario.ask);
	const messages: Record<string, unknown>[] = [{ role: 'system', content: await system() }, { role: 'user', content: `${prefix}\n\n${scenario.ask}${invoked ? `\n\n${invoked.text}` : ''}` }];
	const outcome: Outcome = { scenario: scenario.name, status: 'answered', rounds: 0, calls: [], tokensIn: 0, tokensOut: 0, peakTokens: 0, seconds: 0, answer: '', checks: [] };
	const hooks = extension.hooks as unknown as { task: string; handlers: { beforeTool?: (call: { name: string; arguments: unknown }, api: unknown, context: unknown) => Promise<{ block?: string } | undefined>; beforeProviderRequest?: (request: { payload: unknown; model: unknown }, api: unknown, context: unknown) => Promise<{ payload: unknown } | undefined> } }[];
	const started = Date.now();
	for (let round = 0; ; round++) {
		messages[0].content = await system();
		const tools = offered();
		let payload: Record<string, unknown> = { model: MODEL, max_tokens: 4000, messages, tools: tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) };
		// The redesign's own request hook, which closes the last step; it reads how many rounds the run has had.
		const api = { conversationId: 'eval', snapshot: async () => ({ run: { turns: round, first: 'x' } }), entries: async () => ({ items: [] }) };
		for (const hook of hooks) { const changed = await hook.handlers.beforeProviderRequest?.({ payload, model: { api: 'openai-completions' } }, api, {}).catch(() => undefined); if (changed) payload = changed.payload as Record<string, unknown>; }
		const completion = await complete(payload);
		outcome.tokensIn += completion.usage?.prompt_tokens ?? 0;
		outcome.tokensOut += completion.usage?.completion_tokens ?? 0;
		outcome.peakTokens = Math.max(outcome.peakTokens, completion.usage?.prompt_tokens ?? 0);
		const message = completion.choices[0].message;
		if (!message.tool_calls?.length) { outcome.answer = message.content ?? ''; break; }
		outcome.rounds = round + 1;
		messages.push({ role: 'assistant', content: message.content || '', tool_calls: message.tool_calls });
		const results = await Promise.all(message.tool_calls.map(async (call) => {
			let args: unknown = {};
			try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* the tool will say so */ }
			let textOut = '', error = false;
			try {
				let blocked: string | undefined;
				for (const hook of hooks) { const verdict = await hook.handlers.beforeTool?.({ name: call.function.name, arguments: args }, api, {}); if (verdict?.block) blocked = verdict.block; }
				const tool = tools.find((item) => item.name === call.function.name);
				if (blocked) { textOut = blocked; error = true; }
				else if (!tool) { textOut = `No tool named ${call.function.name}.`; error = true; }
				else textOut = (await tool.execute(args)).output.map((part) => part.type === 'text' ? part.text : `[image ${part.mimeType}]`).join('\n');
			} catch (caught) { textOut = String((caught as Error).message ?? caught); error = true; }
			outcome.calls.push({ round: round + 1, name: call.function.name, args: call.function.arguments.slice(0, 300), chars: textOut.length, ...(error ? { error } : {}) });
			return { role: 'tool', tool_call_id: call.id, content: textOut };
		}));
		messages.push(...results);
		if (round + 1 >= MAX_TURNS) { outcome.status = 'turn_limit'; break; }
	}
	outcome.seconds = Math.round((Date.now() - started) / 100) / 10;
	if (table) outcome.table = table.items();
	outcome.checks = scenario.checks.map((check) => ({ name: check.name, pass: !!check.pass({ answer: outcome.answer, calls: outcome.calls, went, items: table?.items() ?? [] }) }));
	return outcome;
}

/**
 * Experiment (CHAT_EVAL_VARIANT=code): the table tools behind one tool that runs JavaScript, with their
 * schemas a `table_help` call away, the way tldraw's MCP server has `exec` and `search`. Checks that
 * look for a tool by name don't see calls made inside the code. See docs/tables/tldraw-mcp-comparison.md.
 */
function codeMode(tools: Tool[]): Tool[] {
	const kept = tools.filter((tool) => !tool.name.startsWith('table_') || tool.name === 'table_new' || tool.name === 'table_look');
	const fns = tools.filter((tool) => tool.name.startsWith('table_') && tool.name !== 'table_new' && tool.name !== 'table_look');
	if (!fns.length) return kept;
	const short = (tool: Tool) => `table.${tool.name.slice(6)}({ ${Object.keys((tool.parameters as { properties?: object }).properties ?? {}).join(', ')} }): ${tool.description.split(/(?<=[.:]) /)[0]}`;
	return [...kept, {
		name: 'table_help',
		description: 'The full description and argument schema of table functions, by name (such as ["add", "arrange"]). Call it before the first use of a function in table_run.',
		parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] },
		async execute(args: unknown) { const names = ((args as { names?: string[] }).names ?? []).map((name) => name.replace(/^table[._]/, '')); return { output: [{ type: 'text', text: JSON.stringify(fns.filter((tool) => names.includes(tool.name.slice(6))).map((tool) => ({ name: `table.${tool.name.slice(6)}`, description: tool.description, args: tool.parameters }))) }] }; }
	}, {
		name: 'table_run',
		description: ['Run JavaScript on the table. The code is the body of an async function with `table` in scope; every table function takes one object and returns a promise of its result (ids and boxes of what it touched). Use `return` to send something back. Do everything for one request in one run: results of one call (ids) feed the next.', 'Functions:', ...fns.map(short), 'Example: const { added } = await table.add({ items: [{ note: "A" }, { note: "B" }] }); await table.connect({ links: [{ from: added[0].id, to: added[1].id }] }); return added;'].join('\n'),
		parameters: { type: 'object', properties: { code: { type: 'string', description: 'JavaScript: the body of an async function. `table` is in scope.' } }, required: ['code'] },
		async execute(args: unknown) {
			const api = Object.fromEntries(fns.map((tool) => [tool.name.slice(6), async (input: unknown) => { const out = (await tool.execute(input ?? {})).output.map((part) => part.text ?? '').join('\n'); try { return JSON.parse(out); } catch { return out; } }]));
			const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...names: string[]) => (...values: unknown[]) => Promise<unknown>;
			const result = await new AsyncFunction('table', String((args as { code?: string }).code ?? ''))(api);
			return { output: [{ type: 'text', text: (JSON.stringify(result) ?? 'done').slice(0, 8000) }] };
		}
	}];
}

const label = process.env.CHAT_EVAL_LABEL || 'run';
const wanted = process.argv.slice(2);
const repeat = Number(process.env.CHAT_EVAL_REPEAT) || 1;
const micropub = await contentMicropub();
const outcomes: Outcome[] = [];
for (const scenario of SCENARIOS.filter((item) => !wanted.length || wanted.includes(item.name))) {
	for (let n = 0; n < repeat; n++) {
		const outcome = await run(scenario, micropub).catch((error) => ({ scenario: scenario.name, status: 'turn_limit', rounds: 0, calls: [], tokensIn: 0, tokensOut: 0, peakTokens: 0, seconds: 0, answer: `ERROR ${error}`, checks: [] } as Outcome));
		outcomes.push(outcome);
		console.log(`\n## ${outcome.scenario} [${label} ${MODEL}] ${outcome.status}: ${outcome.rounds} rounds, ${outcome.calls.length} calls, ${outcome.tokensIn}+${outcome.tokensOut} tokens (largest request ${outcome.peakTokens}), ${outcome.seconds}s`);
		for (const call of outcome.calls) console.log(`  ${call.round}. ${call.name}(${call.args.slice(0, 140)}) → ${call.chars} chars${call.error ? ' ERROR' : ''}`);
		for (const check of outcome.checks) console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
		console.log(outcome.answer.split('\n').map((line) => `  > ${line}`).join('\n'));
	}
}
const out = process.env.CHAT_EVAL_OUT;
if (out) { await mkdir(out, { recursive: true }); await writeFile(`${out}/${label}-${MODEL.replaceAll('/', '_')}.json`, JSON.stringify(outcomes, null, 1)); }
