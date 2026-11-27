import { describe, expect, test } from 'bun:test';
import type { ChatThreadSummary } from '../src/lib/chat';
import { ChatManage, type ChatActions, type ChatChange } from '../src/lib/components/chat/manage.svelte';
import { deleteThreadFiles, listThreads, saveSummary } from '../src/lib/server/chat/threads';

const summary = (id: string, updatedAt: number, archivedAt?: number): ChatThreadSummary => ({ id, title: `Chat ${id}`, createdAt: updatedAt, updatedAt, messageCount: 2, ...(archivedAt ? { archivedAt } : {}) });

/** As much of R2 as the thread list uses. */
function bucket() {
	const objects = new Map<string, { body: string; customMetadata?: Record<string, string> }>();
	const r2 = {
		async put(key: string, body: string, options?: { customMetadata?: Record<string, string> }) { objects.set(key, { body, customMetadata: options?.customMetadata }); },
		async get(key: string) { const object = objects.get(key); return object ? { json: async () => JSON.parse(object.body) } : null; },
		async delete(keys: string | string[]) { for (const key of [keys].flat()) objects.delete(key); },
		async list({ prefix }: { prefix: string }) {
			return { truncated: false, objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, customMetadata: object.customMetadata, uploaded: new Date(0) })) };
		}
	};
	return { objects, r2: r2 as unknown as R2Bucket };
}

describe('the list of chats', () => {
	test('archived chats leave the list and are listed on their own', async () => {
		const { r2 } = bucket();
		await saveSummary(r2, summary('aaaaaaaaaa', 3));
		await saveSummary(r2, summary('bbbbbbbbbb', 2, 10));
		await saveSummary(r2, summary('cccccccccc', 1));
		expect((await listThreads(r2)).map((thread) => thread.id)).toEqual(['aaaaaaaaaa', 'cccccccccc']);
		expect((await listThreads(r2, 50, true)).map((thread) => thread.id)).toEqual(['bbbbbbbbbb']);
	});

	test('a chat brought back is in the list again', async () => {
		const { r2 } = bucket();
		await saveSummary(r2, summary('aaaaaaaaaa', 3, 10));
		await saveSummary(r2, summary('aaaaaaaaaa', 3));
		expect((await listThreads(r2)).map((thread) => thread.id)).toEqual(['aaaaaaaaaa']);
		expect(await listThreads(r2, 50, true)).toEqual([]);
	});

	test('a deleted chat leaves the list and the search', async () => {
		const { r2, objects } = bucket();
		await saveSummary(r2, summary('aaaaaaaaaa', 3));
		objects.set('chat/search/aaaaaaaaaa.json', { body: '{}' });
		await deleteThreadFiles(r2, 'aaaaaaaaaa');
		expect(objects.size).toBe(0);
		// Never an address made from something that isn't a chat's id.
		objects.set('chat/threads/../x.json', { body: '{}' });
		await deleteThreadFiles(r2, '../x');
		expect(objects.size).toBe(1);
	});
});

describe('ChatManage', () => {
	const chat = summary('aaaaaaaaaa', 3);
	function made(over: Partial<ChatActions> = {}) {
		const calls: string[] = [];
		const changes: ChatChange[] = [];
		const actions: ChatActions = {
			archive: async (id, archived) => { calls.push(`archive ${id} ${archived}`); return summary(id, 3, archived ? 10 : undefined); },
			remove: async (id) => { calls.push(`remove ${id}`); },
			...over
		};
		return { calls, changes, manage: new ChatManage(actions, (change) => changes.push(change)) };
	}

	test('archives a chat, and brings an archived one back', async () => {
		const { manage, calls, changes } = made();
		expect((await manage.archive(chat))?.archivedAt).toBe(10);
		expect((await manage.archive(summary('aaaaaaaaaa', 3, 10)))?.archivedAt).toBeUndefined();
		expect(calls).toEqual(['archive aaaaaaaaaa true', 'archive aaaaaaaaaa false']);
		expect(changes.map((change) => change.kind)).toEqual(['archived', 'unarchived']);
	});

	test('an archive that fails says why and changes nothing', async () => {
		const { manage, changes } = made({ archive: async () => { throw new Error('The site couldn’t be reached. Try again.'); } });
		expect(await manage.archive(chat)).toBeNull();
		expect(manage.error).toBe('The site couldn’t be reached. Try again.');
		expect(changes).toEqual([]);
	});

	test('a delete waits to be confirmed', async () => {
		const { manage, calls, changes } = made();
		const deleted = manage.remove(chat);
		expect(manage.asking?.id).toBe('aaaaaaaaaa');
		expect(calls).toEqual([]);
		await manage.confirm();
		expect(await deleted).toBe(true);
		expect(calls).toEqual(['remove aaaaaaaaaa']);
		expect(manage.asking).toBeNull();
		expect(changes).toEqual([{ id: 'aaaaaaaaaa', kind: 'deleted' }]);
	});

	test('cancelling deletes nothing', async () => {
		const { manage, calls, changes } = made();
		const deleted = manage.remove(chat);
		manage.cancel();
		expect(await deleted).toBe(false);
		expect(calls).toEqual([]);
		expect(changes).toEqual([]);
	});

	test('a delete that fails keeps the question up with why', async () => {
		const { manage, changes } = made({ remove: async () => { throw new Error('That didn’t delete. Try again.'); } });
		void manage.remove(chat);
		await manage.confirm();
		expect(manage.asking?.id).toBe('aaaaaaaaaa');
		expect(manage.deleteError).toBe('That didn’t delete. Try again.');
		expect(changes).toEqual([]);
	});
});
