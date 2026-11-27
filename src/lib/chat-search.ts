/**
 * Searching Casey's chats by title and by what was said. Each thread keeps a plain-text copy of
 * its conversation for this (`ChatSearchDoc`, written beside its summary); `searchChats` ranks them.
 */
import type { ChatMessage, ChatThreadSummary } from './chat';

/** A thread as the search reads it: its title and each message's words, without steps or their results. */
export interface ChatSearchDoc {
	id: string;
	title: string;
	updatedAt: number;
	messages: { role: 'user' | 'assistant'; text: string }[];
}

/** A thread that matched, with the passage that matched it. */
export interface ChatSearchResult {
	id: string;
	title: string;
	updatedAt: number;
	/** Where the words were found: the title alone, or a passage of the conversation. */
	excerpt?: string;
	/** Who wrote the passage. */
	by?: 'user' | 'assistant';
	archived?: boolean;
}

const MAX_MESSAGE = 6000;
const MAX_MESSAGES = 400;

/** Markdown down to its words: links keep their text, code fences and marks go. */
export function plainChatText(markdown: string): string {
	return markdown
		.replace(/```[^\n]*\n?/g, ' ')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~>#]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function chatSearchDoc(thread: Pick<ChatThreadSummary, 'id' | 'title' | 'updatedAt'>, messages: ChatMessage[]): ChatSearchDoc {
	return {
		id: thread.id, title: thread.title, updatedAt: thread.updatedAt,
		messages: messages.slice(-MAX_MESSAGES).map((message) => ({ role: message.role, text: plainChatText(message.content).slice(0, MAX_MESSAGE) })).filter((message) => message.text)
	};
}

const fold = (text: string) => text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
export const searchWords = (query: string) => fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The passage around `at`, cut at word edges, with … where it was cut. */
function passage(text: string, at: number, length: number, around = 60, most = 160): string {
	let from = Math.max(0, at - around);
	let to = Math.min(text.length, Math.max(at + length + around, from + most));
	if (from > 0) from = text.indexOf(' ', from) + 1 || from;
	if (to < text.length) to = text.lastIndexOf(' ', to) > from ? text.lastIndexOf(' ', to) : to;
	return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

/**
 * The threads holding every word of `query` (in the title or anywhere in the conversation), best
 * first: the whole phrase beats scattered words, a title beats the conversation, then the newest.
 */
export function searchChats(docs: ChatSearchDoc[], query: string, limit = 8): ChatSearchResult[] {
	const words = searchWords(query);
	if (!words.length) return [];
	const phrase = fold(query.trim());
	const found: { result: ChatSearchResult; score: number }[] = [];
	for (const doc of docs) {
		const title = fold(doc.title);
		const texts = doc.messages.map((message) => fold(message.text));
		const everywhere = [title, ...texts].join('\n');
		if (!words.every((word) => everywhere.includes(word))) continue;
		let score = 0;
		if (title.includes(phrase)) score += 100;
		else score += 40 * words.filter((word) => title.includes(word)).length / words.length;
		// The passage to show: the phrase if some message has it, otherwise the message with the most of the words.
		let best = -1, bestAt = 0, bestLength = 0, bestHits = 0;
		texts.forEach((text, index) => {
			const at = text.indexOf(phrase);
			const hits = at >= 0 ? words.length + 1 : words.filter((word) => text.includes(word)).length;
			if (hits > bestHits) {
				best = index;
				bestHits = hits;
				const first = at >= 0 ? at : Math.min(...words.map((word) => text.indexOf(word)).filter((found) => found >= 0));
				bestAt = first;
				bestLength = at >= 0 ? phrase.length : words[0].length;
			}
		});
		if (bestHits > words.length) score += 30;
		else if (bestHits) score += 10 * bestHits / words.length;
		const message = best >= 0 ? doc.messages[best] : undefined;
		// Folding can change a text's length (ligatures); the passage is only a little off then.
		found.push({ score, result: { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, ...(message ? { excerpt: passage(message.text, bestAt, bestLength), by: message.role } : {}) } });
	}
	return found.sort((a, b) => b.score - a.score || b.result.updatedAt - a.result.updatedAt).slice(0, limit).map(({ result }) => result);
}

/** Which of a few date headings a chat sits under in the list, as chat apps group them. */
export function chatDateGroup(at: number, now = Date.now()): string {
	const day = (time: number) => { const date = new Date(time); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
	const days = Math.round((day(now) - day(at)) / 86_400_000);
	if (days <= 0) return 'Today';
	if (days === 1) return 'Yesterday';
	if (days <= 7) return 'Previous 7 days';
	if (days <= 30) return 'Previous 30 days';
	return new Date(at).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

/** Threads (newest first) under their date headings, in order. */
export function groupChatsByDate<T extends { updatedAt: number }>(threads: T[], now = Date.now()): { label: string; threads: T[] }[] {
	const groups: { label: string; threads: T[] }[] = [];
	for (const thread of threads) {
		const label = chatDateGroup(thread.updatedAt, now);
		const last = groups.at(-1);
		if (last?.label === label) last.threads.push(thread);
		else groups.push({ label, threads: [thread] });
	}
	return groups;
}
