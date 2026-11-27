/**
 * The list of /chat threads. Each thread's agent writes a small summary to
 * `PUBLISHING_STATE` at `chat/threads/<id>.json` whenever it changes, so the index page
 * can list threads without waking every Durable Object.
 */
import { CHAT_ID, type ChatMessage, type ChatThreadSummary } from '../../chat';
import { chatSearchDoc, searchChats, type ChatSearchDoc, type ChatSearchResult } from '../../chat-search';

const PREFIX = 'chat/threads/';
/** Each thread's words for searching (`ChatSearchDoc`), beside its summary. Only ever read for the owner. */
const SEARCH_PREFIX = 'chat/search/';

export async function saveSummary(bucket: R2Bucket, summary: ChatThreadSummary): Promise<void> {
	if (!CHAT_ID.test(summary.id)) return;
	await bucket.put(`${PREFIX}${summary.id}.json`, JSON.stringify(summary), {
		httpMetadata: { contentType: 'application/json' },
		customMetadata: { updatedAt: String(summary.updatedAt), ...(summary.archivedAt ? { archived: '1' } : {}) }
	});
}

/** Keep the thread's words where the search can read them without waking its Durable Object. */
export async function saveSearchDoc(bucket: R2Bucket, summary: ChatThreadSummary, messages: ChatMessage[]): Promise<void> {
	if (!CHAT_ID.test(summary.id)) return;
	await bucket.put(`${SEARCH_PREFIX}${summary.id}.json`, JSON.stringify(chatSearchDoc(summary, messages)), { httpMetadata: { contentType: 'application/json' } });
}

/** A deleted thread leaves the lists and the search. */
export async function deleteThreadFiles(bucket: R2Bucket | undefined, id: string): Promise<void> {
	if (!bucket || !CHAT_ID.test(id)) return;
	await bucket.delete([`${PREFIX}${id}.json`, `${SEARCH_PREFIX}${id}.json`]);
	for (const version of docCache.keys()) if (version.startsWith(`${id}:`)) docCache.delete(version);
}

const docCache = new Map<string, ChatSearchDoc>();

/**
 * Chats whose title or conversation holds the words, best first, among the 200 most recent.
 * A thread from before search docs were kept is read from its Durable Object once and its doc saved.
 */
export async function searchThreads(env: { PUBLISHING_STATE?: R2Bucket; ChatThread?: DurableObjectNamespace }, query: string, limit = 8): Promise<ChatSearchResult[]> {
	const bucket = env.PUBLISHING_STATE;
	if (!bucket || !query.trim()) return [];
	// Archived chats are searched too, and say so.
	const threads = (await Promise.all([listThreads(bucket, 200), listThreads(bucket, 200, true)])).flat();
	const archived = new Set(threads.filter((thread) => thread.archivedAt).map((thread) => thread.id));
	const docs = await Promise.all(threads.map(async (thread): Promise<ChatSearchDoc> => {
		const titled = { id: thread.id, title: thread.title, updatedAt: thread.updatedAt, messages: [] };
		// Typing searches again and again: a thread that hasn't moved is read once per isolate.
		const version = `${thread.id}:${thread.updatedAt}`;
		const kept = docCache.get(version);
		if (kept) return kept;
		const saved = await (await bucket.get(`${SEARCH_PREFIX}${thread.id}.json`).catch(() => null))?.json<ChatSearchDoc>().catch(() => null);
		// The summary is the newer of the two for the title and the time.
		if (saved) {
			const doc = { ...saved, title: thread.title, updatedAt: thread.updatedAt };
			if (docCache.size > 400) docCache.clear();
			docCache.set(version, doc);
			return doc;
		}
		const snapshot = await threadStub(env, thread.id)?.snapshot().catch(() => null);
		if (!snapshot) return titled;
		await saveSearchDoc(bucket, snapshot.thread, snapshot.messages).catch(() => undefined);
		return chatSearchDoc(thread, snapshot.messages);
	}));
	return searchChats(docs, query, limit).map((result) => (archived.has(result.id) ? { ...result, archived: true } : result));
}

/** Threads, most recently active first: the ones in the list of chats, or with `archived` the ones put away. */
export async function listThreads(bucket: R2Bucket | undefined, limit = 50, archived = false): Promise<ChatThreadSummary[]> {
	if (!bucket) return [];
	const keys: { key: string; updatedAt: number }[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: PREFIX, cursor, include: ['customMetadata'] } as R2ListOptions);
		for (const object of page.objects) if (!!object.customMetadata?.archived === archived) keys.push({ key: object.key, updatedAt: Number(object.customMetadata?.updatedAt) || object.uploaded.getTime() });
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor && keys.length < 2000);
	const newest = keys.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
	const summaries = await Promise.all(newest.map(async ({ key }) => (await bucket.get(key))?.json<ChatThreadSummary>().catch(() => null)));
	return summaries.filter((summary): summary is ChatThreadSummary => !!summary && summary.messageCount > 0);
}

/** Ten lowercase letters and digits. */
export function newThreadId(): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

/** A thread's agent, by id. Native `getByName`, so SvelteKit routes needn't bundle the Agents SDK. */
export interface ChatThreadStub {
	snapshot(): Promise<import('../../chat').ChatSnapshot | null>;
	start(id: string, origin: string, viewer: import('../../chat').ChatViewer, text: string, page?: import('../../chat').ChatPage, selection?: unknown, sayId?: unknown): Promise<{ ok: true } | { error: string }>;
	say(viewer: import('../../chat').ChatViewer | null, text: string, page?: import('../../chat').ChatPage, selection?: unknown): Promise<{ ok: true } | { error: string }>;
	/** Puts the chat away or brings it back; null when there is no such thread. */
	archive(archived: boolean): Promise<import('../../chat').ChatThreadSummary | null>;
	/** Deletes the chat and everything said in it; false when there is no such thread. */
	remove(): Promise<boolean>;
	/** A table's thread, made on first ask; null when the thread id isn't that table's. */
	openTable(tableId: string, origin: string, name: string): Promise<import('../../chat').ChatSnapshot | null>;
	/** The table's canvas inside Claude (`remote-canvas.ts`): a view opens, asks for its next change, reports on one; `/mcp` asks whether one is open and for a change. */
	viewAttach(view: string): Promise<void>;
	viewNext(view: string, wait?: number): Promise<import('./remote-canvas').ViewTurn>;
	viewDone(view: string, reply: import('../../table-agent').TableOpReply): Promise<void>;
	viewOpen(): Promise<boolean>;
	viewOp(op: import('../../table-agent').TableOp): Promise<unknown>;
}

export function threadStub(env: { ChatThread?: DurableObjectNamespace }, id: string): ChatThreadStub | undefined {
	if (!env.ChatThread || !CHAT_ID.test(id)) return;
	return env.ChatThread.getByName(id) as unknown as ChatThreadStub;
}
