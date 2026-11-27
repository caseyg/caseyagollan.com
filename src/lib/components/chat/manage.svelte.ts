/**
 * Archiving and deleting chats, for Casey. `ChatLayout` provides one of these to the pages inside
 * it and draws the question a delete asks first; the list, a chat's header and the archive each
 * offer the same actions through it.
 */
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { ChatThreadSummary } from '$lib/chat';

/** What a chat's actions need of it. */
export type ManagedChat = Pick<ChatThreadSummary, 'id' | 'title' | 'archivedAt'>;

/** How the changes are made: `/api/chat` on the site (`chatActions`), or in memory for stories and tests. Each throws with words to show when it fails. */
export interface ChatActions {
	archive(id: string, archived: boolean): Promise<ChatThreadSummary>;
	remove(id: string): Promise<void>;
}

export type ChatChange = { id: string; kind: 'archived' | 'unarchived' | 'deleted' };

async function ask(method: 'PATCH' | 'DELETE', body: unknown): Promise<{ thread?: ChatThreadSummary }> {
	const response = await fetch('/api/chat', { method, credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
	const answer = (await response?.json().catch(() => null)) as { thread?: ChatThreadSummary; error?: string } | null;
	if (!response?.ok) throw new Error(answer?.error || (response ? 'That didn’t work. Try again.' : 'The site couldn’t be reached. Try again.'));
	return answer ?? {};
}

export const chatActions: ChatActions = {
	archive: async (id, archived) => {
		const { thread } = await ask('PATCH', { id, archived });
		if (!thread) throw new Error('That didn’t work. Try again.');
		return thread;
	},
	remove: async (id) => { await ask('DELETE', { id }); }
};

export class ChatManage {
	/** The chat a delete is being asked about. */
	asking = $state<ManagedChat | null>(null);
	/** Its title, kept while the question closes. */
	askingTitle = $state('');
	/** Why the delete being asked about didn't happen. */
	deleteError = $state('');
	/** Why the last archive or unarchive didn't happen. */
	error = $state('');

	/** Chats archived or brought back here, by id: when each was archived, or null for one that is back. Newer than what a page was loaded with. */
	changes = new SvelteMap<string, number | null>();

	#actions: ChatActions;
	#onchange?: (change: ChatChange) => void;
	#answer?: (deleted: boolean) => void;

	constructor(actions: ChatActions, onchange?: (change: ChatChange) => void) {
		this.#actions = actions;
		this.#onchange = onchange;
	}

	/** Puts a chat away, or brings it back. The thread as it now is, or null when it didn't work (`error` says why). */
	async archive(chat: ManagedChat, archived = !chat.archivedAt): Promise<ChatThreadSummary | null> {
		this.error = '';
		try {
			const thread = await this.#actions.archive(chat.id, archived);
			this.changes.set(chat.id, thread.archivedAt ?? null);
			this.#onchange?.({ id: chat.id, kind: archived ? 'archived' : 'unarchived' });
			return thread;
		} catch (cause) {
			this.error = (cause as Error).message;
			return null;
		}
	}

	/** The chat as it stands after anything done to it here. */
	current<T extends ManagedChat>(chat: T): T {
		const changed = this.changes.get(chat.id);
		return changed === undefined ? chat : { ...chat, archivedAt: changed ?? undefined };
	}

	/** Asks first. Resolves true once the chat is deleted, false when Casey thought better of it. */
	remove(chat: ManagedChat): Promise<boolean> {
		this.#answer?.(false);
		this.deleteError = '';
		this.asking = chat;
		this.askingTitle = chat.title;
		return new Promise((resolve) => { this.#answer = resolve; });
	}

	/** Casey said yes. The question stays up, with why, if it doesn't work. */
	async confirm(): Promise<void> {
		const chat = this.asking;
		if (!chat) return;
		this.deleteError = '';
		try {
			await this.#actions.remove(chat.id);
		} catch (cause) {
			this.deleteError = (cause as Error).message;
			return;
		}
		this.asking = null;
		this.#answer?.(true);
		this.#answer = undefined;
		this.#onchange?.({ id: chat.id, kind: 'deleted' });
	}

	cancel() {
		this.asking = null;
		this.#answer?.(false);
		this.#answer = undefined;
	}
}

const KEY = Symbol('chat-manage');
export const provideChatManage = (manage: ChatManage | undefined) => setContext(KEY, manage);
export const useChatManage = () => getContext<ChatManage | undefined>(KEY);
