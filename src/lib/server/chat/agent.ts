/**
 * One /chat thread: a Cloudflare Agents SDK agent (a Durable Object with SQLite), named
 * by the thread id. Pi Durable (`PiHarness`) runs the assistant: the transcript, retries,
 * compaction, tool calls, and picking a run up again after an eviction or deploy. This
 * class is the chat around it:
 *
 * - People's messages go to Pi as `chat.say` entries, carrying who wrote them and whether
 *   the server saw Casey's passkey session (`owner`), which gates the Micropub tools.
 * - Everyone can read: connections are readonly for agent state, and the Worker passes
 *   the signed-in viewer (or none) in a header it sets itself (`withViewer`).
 * - Only signed-in viewers can write (`chat:say`), with a per-person rate limit.
 * - While Pi works, a watch on its conversation is folded into chat messages
 *   (`projectMessages`) and sent to every browser as small changes.
 *
 * Imported by worker.mjs, so imports stay relative.
 */
import { Agent, type Connection, type ConnectionContext, type WSMessage } from 'agents';
import { PiHarness } from 'agents/harness/pi';
import { createRegistry, Harness, type ConversationWatch } from '@earendil-works/pi-durable';
import { CHAT_MAX_MESSAGE, chatPage, chatSelection, chatTitle, sayPrefix, SELECTION_LISTED, threadTitle, type ChatAuthor, type ChatClientEvent, type ChatPage, type ChatMessage, type ChatServerEvent, type ChatSnapshot, type ChatThreadSummary, type ChatViewer } from '../../chat';
import { canvasOrder, HIDDEN_TABLE_OP_TIMEOUT, TABLE_OP_TIMEOUT, unansweredTable } from './canvas';
import { publishingConfig } from '../publishing/config';
import type { PublishingEnvironment } from '../publishing/config';
import { randomToken } from '../publishing/dpop';
import { charge, costOf, DEFAULT_MONTHLY_BUDGET, resetsOn, spent } from './budget';
import { viewerFrom } from './identity';
import { DEFAULT_CHAT_MODEL, ModelError, streamCompletion } from './model';
import { diffMessages, projectMessages, SAY_KIND, type Entry, type Live, type SayData } from './projection';
import { chatModels, COMPACTION } from './provider';
import { saveSummary } from './threads';
import { chatExtension, type ThreadHooks } from './tools';
import { itemsFromDocument, tableThreadId, type TableCancelEvent, type TableOp, type TableOpReply } from '../../table-agent';
import { emptyTable, validId } from '../../tables';
import { readTable, writeTable } from '../tables';

export interface ChatAgentEnv extends PublishingEnvironment {
	INFERENCE_COOP_API_KEY?: string;
	CHAT_MODEL?: string;
	/** How hard the model thinks before each step: low (the default), medium or high. */
	CHAT_REASONING_EFFORT?: string;
	/** Another OpenAI-compatible gateway, for local testing; inference.coop otherwise. */
	CHAT_INFERENCE_URL?: string;
	/** US dollars each person may spend a month; default 3. Casey is not capped. */
	CHAT_MONTHLY_BUDGET?: string;
	ASSETS?: Pick<Fetcher, 'fetch'>;
}

interface ConnectionState {
	viewer: ChatViewer | null;
	at: number;
	/** Casey's table page, which can take the assistant's edits. */
	canvas?: boolean;
	/** The page this browser is on, which the chat now follows across the site. */
	page?: ChatPage;
	/** When Casey last did something in this browser (wrote, or brought its tab to the front); see `canvasOrder`. */
	active?: number;
}

/** How long go_to waits for the asker's page to connect, such as while a new chat's page loads. */
const NAVIGATE_WAIT = 20_000;

/** How long the assistant waits for Casey's table page to make a change. */
/** How long go_to waits for a table it sent Casey to to open and take changes. */
const TABLE_OPEN_WAIT = 20_000;
/** The largest answer Casey's table page may send: a `look` picture is a few hundred kilobytes. */
const TABLE_RESULT_MAX = 2_000_000;

const MAX_MESSAGES = 300;
const PER_PERSON_PER_HOUR = 20;
/** Tool rounds one answer may take. The last request of a run is made without tools (`chatExtension`), so it ends in an answer. */
const MAX_TURNS = 8;
/** An owner connection counts as Casey for this long; after that, reconnecting checks again. */
const OWNER_CONNECTION_TTL = 12 * 3600_000;

export class ChatThread extends Agent<ChatAgentEnv & Cloudflare.Env> {
	/** Per object, not module-wide: Pi keeps every Harness subscribed to its registry. */
	private registry = createRegistry();

	readonly harness = new PiHarness({
		harness: ({ storage, context, onWake }) => {
			const { models } = chatModels(this.env);
			this.registry.install(chatExtension({ env: this.env, origin: () => this.origin(), onRunEnd: () => this.runEnded(), onlyOwner: () => this.onlyOwner(), thread: this.hooks(), maxTurns: MAX_TURNS, reasoningEffort: this.env.CHAT_REASONING_EFFORT, waitUntil: (promise) => this.ctx.waitUntil(promise) }));
			return Harness.open(storage, {
				models, registry: this.registry, onWake, identity: { attribution: null },
				// A failed answer doesn't hold up the next person's message.
				settings: { afterFailedRun: 'continue', retry: { maxRetries: 2 }, compaction: COMPACTION }
			}, context);
		},
		defaults: { model: chatModels(this.env).model, maxTurns: MAX_TURNS }
	});

	private ready = false;
	private watch?: ConversationWatch;
	private shown: ChatMessage[] = [];

	constructor(ctx: DurableObjectState, env: ChatAgentEnv & Cloudflare.Env) {
		super(ctx, env);
		this.lifecycle.use(this.harness);
	}

	// ------------------------------------------------------------------ tables and browsers

	/** Table ops sent to Casey's page, waiting for its answer, by op id. */
	private tableOps = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

	private hooks(): ThreadHooks {
		return {
			table: () => this.table(),
			tableOp: (op) => this.tableOp(op),
			readTable: async () => {
				if (this.canvas()) return this.tableOp({ op: 'read' });
				const id = this.table();
				if (!id) throw new Error('There’s no table open beside this chat. Ask Casey to open one.');
				const table = await readTable(this.env.PUBLISHING_STATE, id);
				return { name: table?.name, items: itemsFromDocument(table?.document), note: 'As last saved; Casey doesn’t have the table open.' };
			},
			createTable: async (name) => {
				if (!this.env.PUBLISHING_STATE) throw new Error('Tables aren’t available here.');
				const table = emptyTable(name.trim() || 'Untitled table');
				await writeTable(this.env.PUBLISHING_STATE, table);
				return { id: table.id, url: `/tables/${table.id}`, note: 'A draft: only Casey sees it until it’s published. go_to it to open it and fill it in.' };
			},
			tableOpened: (id) => this.tableOpened(id),
			page: () => this.speakerPage(),
			selection: () => this.selection(),
			navigate: async (path) => {
				const to = this.meta('last_speaker');
				if (!to) return false;
				if (this.sendNavigate(to, path)) return true;
				// Their page may still be on its way: a new chat's first answer starts while the
				// browser is following the redirect to the thread, before its socket connects.
				this.pendingNavigation?.done(false);
				return new Promise<boolean>((resolve) => {
					const timer = setTimeout(() => this.pendingNavigation?.done(false), NAVIGATE_WAIT);
					this.pendingNavigation = { to, path, done: (sent) => { clearTimeout(timer); this.pendingNavigation = undefined; resolve(sent); } };
				});
			}
		};
	}

	/** The page the person who last wrote is on, from the browser they used most recently. */
	/** The ids Casey had selected on the table when writing the latest message (none if someone else wrote last). */
	private selection(): string[] {
		try { return (JSON.parse(this.meta('selection') ?? '[]') as string[]).filter((id) => typeof id === 'string'); } catch { return []; }
	}

	private speakerPage(): ChatPage | undefined {
		const speaker = this.meta('last_speaker');
		let found: ConnectionState | undefined;
		for (const connection of this.getConnections<ConnectionState>()) {
			const state = connection.state;
			if (!speaker || state?.viewer?.id !== speaker || !state.page) continue;
			if (!found || (state.active ?? state.at) >= (found.active ?? found.at)) found = state;
		}
		return found?.page;
	}

	/** A page to send someone to once their browser connects; see `navigate`. */
	private pendingNavigation?: { to: string; path: string; done: (sent: boolean) => void };

	/** Send a person's open pages of this thread to a page of the site; false when none is open. */
	private sendNavigate(to: string, path: string): boolean {
		let sent = false;
		for (const connection of this.getConnections<ConnectionState>()) {
			if (connection.state?.viewer?.id !== to) continue;
			connection.send(JSON.stringify({ type: 'chat:navigate', path } satisfies ChatServerEvent));
			sent = true;
		}
		return sent;
	}

	/** Casey's open table pages that can take edits, the one to try first at the front. */
	private canvases(): Connection<ConnectionState>[] {
		const open: Connection<ConnectionState>[] = [];
		for (const connection of this.getConnections<ConnectionState>()) if (connection.state?.canvas && connection.state.viewer?.owner) open.push(connection);
		// A page left open in another tab (or a phone's sleeping browser) still looks connected.
		return canvasOrder(open, (connection) => ({ hidden: connection.state?.page?.hidden, active: connection.state?.active ?? connection.state?.at ?? 0 }));
	}

	private canvas(): Connection<ConnectionState> | undefined {
		return this.canvases()[0];
	}

	/** Waiting for Casey's page to show a table, after go_to sent them there. */
	private tableWaits = new Set<{ id: string; done: (opened: boolean) => void }>();

	private tableOpened(id: string): Promise<boolean> {
		if (this.canvas()?.state?.page?.table === id) return Promise.resolve(true);
		return new Promise((resolve) => {
			const wait = { id, done: (opened: boolean) => { clearTimeout(timer); this.tableWaits.delete(wait); resolve(opened); } };
			const timer = setTimeout(() => wait.done(false), TABLE_OPEN_WAIT);
			this.tableWaits.add(wait);
		});
	}

	/** The table the chat is about: the one Casey has open beside it, else the thread's own table. */
	private table(): string | undefined {
		return this.canvas()?.state?.page?.table ?? this.meta('table');
	}

	/** Ask Casey's table page for a change. A page that doesn't answer is told to drop it, and the next open page of the same table is tried once. */
	private async tableOp(op: TableOp): Promise<unknown> {
		const [first, ...rest] = this.canvases();
		if (!first) throw new Error('Casey doesn’t have this table open, so it can’t be changed right now. Ask Casey to open it.');
		const table = first.state?.page?.table;
		const next = rest.find((connection) => connection.state?.page?.table === table);
		let hidden = false;
		for (const connection of next ? [first, next] : [first]) {
			const answer = await this.tableOpOn(connection, op);
			if (answer.answered) return answer.result;
			hidden ||= !!connection.state?.page?.hidden;
		}
		throw new Error(unansweredTable(hidden));
	}

	/** One page's go at a change: its answer (an error it reports is thrown), or `answered: false` when it stayed silent. */
	private tableOpOn(connection: Connection<ConnectionState>, op: TableOp): Promise<{ answered: true; result: unknown } | { answered: false }> {
		const id = randomToken(8);
		const hidden = !!connection.state?.page?.hidden;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.tableOps.delete(id);
				console.warn(JSON.stringify({ event: 'chat_table_op_timeout', op: op.op, table: connection.state?.page?.table, hidden }));
				// That page isn't answering: it must not make the change late, and gets no more until it says where it is again.
				try { connection.send(JSON.stringify({ type: 'table:cancel', id } satisfies TableCancelEvent)); } catch { /* already gone */ }
				if (connection.state) connection.setState({ ...connection.state, canvas: false });
				resolve({ answered: false });
			}, hidden ? HIDDEN_TABLE_OP_TIMEOUT : TABLE_OP_TIMEOUT);
			this.tableOps.set(id, { resolve: (result) => resolve({ answered: true, result }), reject, timer });
			connection.send(JSON.stringify({ type: 'table:op', id, ...op }));
		});
	}

	private tableReply(reply: TableOpReply) {
		const waiting = this.tableOps.get(reply.id);
		if (!waiting) return;
		this.tableOps.delete(reply.id);
		clearTimeout(waiting.timer);
		if (reply.ok) waiting.resolve(reply.result);
		else waiting.reject(new Error(String(reply.error).slice(0, 300)));
	}

	/**
	 * A table's thread, made the first time its page asks: named for the table, at the id
	 * `tableThreadId` gives. Returns the thread, or null for an id that isn't the table's.
	 */
	async openTable(tableId: string, origin: string, name: string): Promise<ChatSnapshot | null> {
		this.setup();
		if (!validId(tableId)) return null;
		const id = tableThreadId(tableId);
		if (!this.meta('id')) {
			this.setMeta('id', id);
			this.setMeta('origin', origin);
			this.setMeta('created', String(Date.now()));
			this.setMeta('title', chatTitle(name || 'Table'));
			this.setMeta('table', tableId);
		}
		if (this.meta('id') !== id || this.meta('table') !== tableId) return null;
		return this.snapshot();
	}

	/** Tables first, whichever way the object woke: a WebSocket, RPC from a page, or Pi's alarm. */
	protected setup() {
		if (this.ready) return;
		this.sql`CREATE TABLE IF NOT EXISTS chat_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
		this.sql`CREATE TABLE IF NOT EXISTS chat_said (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, author TEXT NOT NULL, created_at INTEGER NOT NULL)`;
		this.ready = true;
	}

	async onStart() {
		this.setup();
		// A run Pi picked up again after an eviction: watch it so readers see it finish.
		if (this.meta('id') && await this.harness.session().busy().catch(() => false)) await this.follow();
	}

	// ------------------------------------------------------------------ storage

	protected meta(key: string): string | undefined {
		return this.sql<{ value: string }>`SELECT value FROM chat_meta WHERE key = ${key}`[0]?.value;
	}

	protected setMeta(key: string, value: string) {
		this.sql`INSERT INTO chat_meta (key, value) VALUES (${key}, ${value}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
	}

	protected origin() { return this.meta('origin') ?? this.env.AUTH_ORIGIN ?? 'https://caseyagollan.com/'; }

	/** Every entry of the thread, oldest first, paged out of Pi. */
	private async entries(): Promise<Entry[]> {
		const session = this.harness.session();
		const all: Entry[] = [];
		// Pages continue from the last entry seen (inclusive), so its repeat is skipped.
		let page = await session.entries({ order: 'ascending' }, 200);
		all.push(...(page.items as unknown as Entry[]));
		while (page.next && page.items.length && all.length < 5000) {
			const last = all.at(-1)!.id;
			page = await session.entries({ order: 'ascending', minEntryId: last as never }, 201);
			const fresh = (page.items as unknown as Entry[]).filter((entry) => entry.id !== last);
			if (!fresh.length) break;
			all.push(...fresh);
		}
		return all;
	}

	private async live(): Promise<Live> {
		if (this.watch) return (this.watch.value.docs['pi.live'] ?? {}) as Live;
		const watch = await this.harness.session().watch({ min: 1 });
		const live = (watch.value.docs['pi.live'] ?? {}) as Live;
		await watch.stop();
		return live;
	}

	private async messages(): Promise<ChatMessage[]> {
		if (!this.meta('id')) return [];
		return projectMessages(await this.entries(), await this.live());
	}

	private summary(messages: ChatMessage[]): ChatThreadSummary {
		const people = new Map<string, ChatAuthor>();
		for (const row of this.sql<{ author: string }>`SELECT author FROM chat_said ORDER BY created_at DESC`) {
			const author = JSON.parse(row.author) as ChatAuthor;
			if (!people.has(author.id)) people.set(author.id, author);
		}
		const first = messages[0];
		return {
			id: this.meta('id') ?? '', title: this.meta('title') ?? 'New chat',
			createdAt: Number(this.meta('created') ?? first?.createdAt ?? Date.now()),
			updatedAt: Number(this.meta('updated')) || (messages.at(-1)?.createdAt ?? Date.now()),
			messageCount: messages.length, ...(first?.author ? { startedBy: first.author } : {}), participants: [...people.values()].slice(0, 6)
		};
	}

	async snapshot(): Promise<ChatSnapshot | null> {
		this.setup();
		if (!this.meta('id')) return null;
		const messages = this.watch ? this.shown : await this.messages();
		return { thread: this.summary(messages), messages };
	}

	/** The thread's summary changed: a title, a message, an answer. */
	protected async index(messages?: ChatMessage[]) {
		const id = this.meta('id');
		if (id && this.env.PUBLISHING_STATE) await saveSummary(this.env.PUBLISHING_STATE, this.summary(messages ?? await this.messages())).catch(() => undefined);
	}

	/** Start the thread with its first message. */
	async start(id: string, origin: string, viewer: ChatViewer, text: string, page?: ChatPage, selection?: unknown): Promise<{ ok: true } | { error: string }> {
		this.setup();
		if (this.meta('id')) return { error: 'This thread already exists.' };
		this.setMeta('id', id);
		this.setMeta('origin', origin);
		this.setMeta('created', String(Date.now()));
		this.setMeta('title', chatTitle(text));
		return this.say(viewer, text, page, selection);
	}

	/** Add a message from a signed-in viewer (the form fallback and the WebSocket both end here). */
	async say(viewer: ChatViewer | null, value: unknown, where?: unknown, selected?: unknown): Promise<{ ok: true } | { error: string }> {
		this.setup();
		if (!this.meta('id')) return { error: 'This thread doesn’t exist.' };
		if (!viewer) return { error: 'Sign in to take part.' };
		const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
		if (!text) return { error: 'Write something first.' };
		if (text.length > CHAT_MAX_MESSAGE) return { error: `Keep it under ${CHAT_MAX_MESSAGE} characters.` };
		const count = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM chat_said`[0]?.n ?? 0;
		if (count >= MAX_MESSAGES) return { error: 'This thread is full. Start a new one.' };
		if (!viewer.owner) {
			const since = Date.now() - 3600_000;
			const recent = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM chat_said WHERE created_at > ${since} AND author_id = ${viewer.id}`[0]?.n ?? 0;
			if (recent >= PER_PERSON_PER_HOUR) return { error: 'You’ve sent a lot this hour. Try again a little later.' };
		}
		if (!viewer.owner) {
			const budget = Number(this.env.CHAT_MONTHLY_BUDGET) || DEFAULT_MONTHLY_BUDGET;
			if (await spent(this.env.PUBLISHING_STATE, viewer.id) >= budget) return { error: `You’ve used this month’s chat allowance ($${budget}). It starts again on ${resetsOn(Date.now())}.` };
		}
		const { owner, ...rest } = viewer;
		const author: ChatAuthor = { ...rest, via: owner ? 'owner' : rest.via };
		const id = randomToken(9), at = Date.now();
		// Where they were, so “this page” means something: the chat follows Casey around the site.
		const page = chatPage(where);
		// What Casey had selected on that table, so “these” means something. Only Casey's table page can act on it.
		const selection = owner && page?.table ? chatSelection(selected) : null;
		const data: SayData = { id, author, owner, at, text, ...(selection ? { selection: { count: selection.count, items: selection.items.slice(0, SELECTION_LISTED) } } : {}) };
		// The model reads who wrote each message, where, and what was selected; the page shows only what they wrote.
		const who = `${author.name}${owner ? ' (Casey, the site’s owner)' : author.url ? ` (${author.url})` : ''}`;
		// Recorded before the run starts: who has written here decides whether Casey's tools are offered.
		this.sql`INSERT INTO chat_said (id, author_id, author, created_at) VALUES (${id}, ${author.id}, ${JSON.stringify(author)}, ${at})`;
		await this.follow();
		this.setMeta('selection', JSON.stringify(selection?.items.map((item) => item.id) ?? []));
		await this.harness.submit(`${sayPrefix(who, this.origin(), page, selection)}\n\n${text}`, { operationId: id, entry: { kind: SAY_KIND, data: data as never } }).catch((error) => {
			this.sql`DELETE FROM chat_said WHERE id = ${id}`;
			throw error;
		});
		this.setMeta('updated', String(at));
		this.setMeta('last_speaker', author.id);
		this.ctx.waitUntil(this.index());
		return { ok: true };
	}

	// ------------------------------------------------------------------ live view

	/** Watch Pi's conversation while it works, sending readers what changed. */
	private async follow() {
		if (this.watch) return;
		this.shown = await this.messages().catch(() => []);
		const watch = await this.harness.session().watch({ min: 20, max: 200 });
		this.watch = watch;
		watch.start(async (call) => {
			if (call.kind !== 'value') return;
			await this.publish().catch((error) => console.warn(JSON.stringify({ event: 'chat_publish_failed', detail: String(error).slice(0, 200) })));
		});
	}

	private publishing?: Promise<void>;
	private again = false;

	/** Re-fold the transcript and send the difference. One at a time; a change during one runs again after. */
	private publish(): Promise<void> {
		if (this.publishing) { this.again = true; return this.publishing; }
		this.publishing = (async () => {
			do {
				this.again = false;
				const next = await this.messages();
				for (const event of diffMessages(this.shown, next)) this.send(event);
				this.shown = next;
				const live = (this.watch?.value.docs['pi.live'] ?? {}) as Live;
				if (this.watch && !live.run && !(await this.harness.pending().catch(() => [])).length) {
					// Done: stop watching so the object can sleep, and move the thread up the list.
					const watch = this.watch;
					this.watch = undefined;
					await watch.stop();
					this.setMeta('updated', String(Date.now()));
					// Send the finished answer whole, so a page that missed part of it along the way still shows it.
					const answer = next.at(-1);
					if (answer?.role === 'assistant') this.send({ type: 'chat:message', message: answer });
					// Why a failed answer stopped (Pi's reason and the gateway's message), so a screenshot of “the answer stopped” can be traced.
					const failure = answer?.role === 'assistant' && answer.status === 'failed' && live.runFailure ? { reason: live.runFailure.reason, detail: live.runFailure.detail?.slice(0, 300) } : undefined;
					console.log(JSON.stringify({ event: 'chat_run_end', thread: this.meta('id'), status: answer?.role === 'assistant' ? answer.status : 'no_answer', ...(failure ? { failure } : {}), chars: answer?.role === 'assistant' ? answer.content.length : 0, tools: answer?.role === 'assistant' ? answer.tools?.map((use) => `${use.tool}:${use.status}`) : undefined }));
					await this.index(next);
					await this.bill().catch((error) => console.warn(JSON.stringify({ event: 'chat_bill_failed', detail: String(error).slice(0, 200) })));
					this.changed();
				}
			} while (this.again);
		})().finally(() => { this.publishing = undefined; });
		return this.publishing;
	}

	/**
	 * Charge what the answers since the last bill cost to the people they answered, split
	 * evenly among the non-owner authors of the messages in that stretch.
	 */
	private async bill() {
		const entries = await this.entries();
		const from = this.meta('billed');
		const start = from ? entries.findIndex((entry) => entry.id === from) + 1 : 0;
		const stretch = entries.slice(start);
		if (!stretch.length) return;
		this.setMeta('billed', stretch.at(-1)!.id);
		const usd = costOf(stretch);
		this.setMeta('cost', String(Number(this.meta('cost') ?? 0) + usd));
		const people = [...new Set(stretch.filter((entry) => entry.kind === SAY_KIND).map((entry) => entry.data as SayData).filter((data) => !data.owner).map((data) => data.author.id))];
		if (!people.length || !usd) return;
		for (const person of people) await charge(this.env.PUBLISHING_STATE, person, usd / people.length);
	}

	/** For subclasses: an answer finished. */
	protected changed() {}

	protected send(event: ChatServerEvent | { type: string; [key: string]: unknown }) {
		this.broadcast(JSON.stringify(event));
	}

	/** After an answer: name the thread once, the way chat apps do. */
	private runEnded() {
		if (this.meta('titled')) return;
		this.setMeta('titled', '1');
		this.ctx.waitUntil(this.nameThread());
	}

	/** Until named, a thread is called by the first line of its first message; if naming fails, that stays. */
	private async nameThread() {
		const apiKey = this.env.INFERENCE_COOP_API_KEY;
		if (!apiKey) return;
		try {
			const messages = await this.messages();
			const asked = messages.find((message) => message.role === 'user')?.content ?? '';
			const answer = messages.find((message) => message.role === 'assistant' && message.content)?.content ?? '';
			const completion = await streamCompletion({
				apiKey, model: this.env.CHAT_MODEL || DEFAULT_CHAT_MODEL, baseUrl: this.env.CHAT_INFERENCE_URL || undefined, maxTokens: 400,
				messages: [
					{ role: 'system', content: 'You name chat threads. Reply with only a title of two to six words, in sentence case, saying what the chat is about. No quotes, no Markdown, no full stop.' },
					{ role: 'user', content: `Question:\n${asked.slice(0, 1500)}\n\nAnswer:\n${answer.slice(0, 1500)}` }
				]
			});
			const title = threadTitle(completion.text);
			if (!title) return;
			this.setMeta('title', title);
			this.send({ type: 'chat:title', title });
			await this.index(messages);
		} catch (error) {
			console.warn(JSON.stringify({ event: 'chat_title_failed', detail: error instanceof ModelError ? error.detail : String(error).slice(0, 200) }));
		}
	}

	// ------------------------------------------------------------------ WebSockets

	shouldConnectionBeReadonly() { return true; }
	/** Browsers here speak only the chat events above, not the SDK's state sync. */
	shouldSendProtocolMessages() { return false; }

	async onConnect(connection: Connection<ConnectionState>, context: ConnectionContext) {
		this.setup();
		const viewer = viewerFrom(context.request);
		connection.setState({ viewer, at: Date.now() });
		const messages = this.watch ? this.shown : await this.messages();
		const snapshot = { thread: this.summary(messages), messages };
		connection.send(JSON.stringify({ type: 'chat:snapshot', snapshot, viewer, tools: this.toolNames(!!viewer?.owner) } satisfies ChatServerEvent));
		const waiting = this.pendingNavigation;
		if (waiting && viewer?.id === waiting.to) waiting.done(this.sendNavigate(waiting.to, waiting.path));
	}

	async onMessage(connection: Connection<ConnectionState>, raw: WSMessage) {
		// Casey's table page answers `look` with a picture, so it may send more than a message.
		if (typeof raw !== 'string' || raw.length > (connection.state?.canvas ? TABLE_RESULT_MAX : CHAT_MAX_MESSAGE * 2)) return;
		let event: ChatClientEvent;
		try { event = JSON.parse(raw); } catch { return; }
		// Writing is something Casey did there; a page saying where it is counts only when it's in front (a
		// background tab says so each time its socket reconnects, which isn't Casey using it).
		const acted = event?.type === 'chat:say' || (event?.type === 'page:here' && !chatPage(event.page)?.hidden);
		if (connection.state && acted) connection.setState({ ...connection.state, active: Date.now() });
		const state = connection.state;
		const viewer = state?.viewer && (!state.viewer.owner || Date.now() - state.at < OWNER_CONNECTION_TTL) ? state.viewer : state?.viewer ? { ...state.viewer, owner: false } : null;
		// Casey's table page says it's there to take edits, and answers them.
		if (event?.type === 'table:ready') {
			if (viewer?.owner && this.meta('table')) connection.setState({ ...state!, canvas: true });
			return;
		}
		// Casey moved to another page; a page with a table can take the assistant's edits.
		if (event?.type === 'page:here') {
			const page = chatPage(event.page) ?? undefined;
			connection.setState({ ...state!, page, canvas: !!(viewer?.owner && page?.table) });
			if (viewer?.owner && page?.table) for (const wait of [...this.tableWaits]) if (wait.id === page.table) wait.done(true);
			connection.send(JSON.stringify({ type: 'chat:abilities', tools: this.toolNames(!!viewer?.owner) } satisfies ChatServerEvent));
			return;
		}
		if (event?.type === 'table:result') {
			if (state?.canvas && typeof event.id === 'string') this.tableReply(event);
			return;
		}
		if (event?.type !== 'chat:say') return;
		const result = await this.say(viewer, event.text, state?.page, event.selection).catch((error) => {
			console.warn(JSON.stringify({ event: 'chat_say_failed', detail: String(error).slice(0, 300) }));
			return { error: 'That didn’t send. Try again.' };
		});
		if ('error' in result) connection.send(JSON.stringify({ type: 'chat:error', error: result.error } satisfies ChatServerEvent));
	}

	/** Whether only Casey has written in this thread. */
	private onlyOwner(): boolean {
		const rows = this.sql<{ author: string }>`SELECT author FROM chat_said`;
		return rows.length > 0 && rows.every((row) => (JSON.parse(row.author) as ChatAuthor).via === 'owner');
	}

	private toolNames(owner: boolean): string[] {
		const table = this.table();
		return ['search_site', 'fetch_page', 'show_page', 'view_image', ...(table ? ['table_read'] : []), ...(owner && table ? ['table'] : []), ...(owner && publishingConfig(this.env) ? ['micropub'] : [])];
	}
}
