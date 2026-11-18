/**
 * The list of /chat threads. Each thread's agent writes a small summary to
 * `PUBLISHING_STATE` at `chat/threads/<id>.json` whenever it changes, so the index page
 * can list threads without waking every Durable Object.
 */
import { CHAT_ID, type ChatThreadSummary } from '../../chat';

const PREFIX = 'chat/threads/';

export async function saveSummary(bucket: R2Bucket, summary: ChatThreadSummary): Promise<void> {
	if (!CHAT_ID.test(summary.id)) return;
	await bucket.put(`${PREFIX}${summary.id}.json`, JSON.stringify(summary), {
		httpMetadata: { contentType: 'application/json' },
		customMetadata: { updatedAt: String(summary.updatedAt) }
	});
}

/** Threads, most recently active first. */
export async function listThreads(bucket: R2Bucket | undefined, limit = 50): Promise<ChatThreadSummary[]> {
	if (!bucket) return [];
	const keys: { key: string; updatedAt: number }[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: PREFIX, cursor, include: ['customMetadata'] } as R2ListOptions);
		for (const object of page.objects) keys.push({ key: object.key, updatedAt: Number(object.customMetadata?.updatedAt) || object.uploaded.getTime() });
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
	start(id: string, origin: string, viewer: import('../../chat').ChatViewer, text: string): Promise<{ ok: true } | { error: string }>;
	say(viewer: import('../../chat').ChatViewer | null, text: string): Promise<{ ok: true } | { error: string }>;
	/** A table's thread, made on first ask; null when the thread id isn't that table's. */
	openTable(tableId: string, origin: string, name: string): Promise<import('../../chat').ChatSnapshot | null>;
}

export function threadStub(env: { ChatThread?: DurableObjectNamespace }, id: string): ChatThreadStub | undefined {
	if (!env.ChatThread || !CHAT_ID.test(id)) return;
	return env.ChatThread.getByName(id) as unknown as ChatThreadStub;
}
