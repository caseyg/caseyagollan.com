/**
 * Shared shapes for /chat: public AI chat threads that anyone can read and signed-in
 * visitors take part in. The server side is `src/lib/server/chat/`; each thread is a
 * `ChatThread` agent (Cloudflare Agents SDK, one Durable Object per thread).
 */

/** How a participant signed in. `owner` is Casey's own passkey session. */
export type ChatProvider = 'owner' | 'indieauth' | 'mastodon' | 'bluesky';

/** Who wrote a message, as shown publicly. Never holds tokens or session data. */
export interface ChatAuthor {
	/** Stable id, such as `web:https://example.com/`, `mastodon:ana@social.coop` or `bluesky:did:plc:…`. */
	id: string;
	name: string;
	/** Profile page: their website, Mastodon profile or Bluesky profile. */
	url?: string;
	photo?: string;
	via: ChatProvider;
}

/** A signed-in viewer. Only the server decides `owner`. */
export interface ChatViewer extends ChatAuthor {
	owner: boolean;
}

/** One step the agent took while answering, shown in gray under its reply. */
export interface ChatToolUse {
	/** `search_site`, `fetch_page`, or a `micropub_*` tool. */
	tool: string;
	/** A short public summary, such as the query or the address. */
	label: string;
	/** Set once the step finished. */
	status: 'running' | 'done' | 'failed';
	/** Links the step found, shown so readers can follow them. Never owner-only data. */
	links?: { url: string; title: string }[];
	/** A page the assistant put in the chat to preview (`show_page`). */
	peek?: { url: string; title: string; excerpt?: string };
	/** A picture the assistant looked at (`view_image`), or its snapshot of a table (`table_look`). */
	picture?: { src: string; alt: string };
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	/** Markdown. */
	content: string;
	/** People for `user`; for `assistant`, the model that answered. */
	author?: ChatAuthor;
	model?: string;
	tools?: ChatToolUse[];
	/** `streaming` while the agent is still writing; `failed` when it stopped with an error. */
	status: 'done' | 'streaming' | 'failed';
	createdAt: number;
}

export interface ChatThreadSummary {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	startedBy?: ChatAuthor;
	/** People who have written in the thread, most recent first, at most six. */
	participants?: ChatAuthor[];
}

export interface ChatSnapshot {
	thread: ChatThreadSummary;
	messages: ChatMessage[];
}

/** Messages the server pushes over the thread's WebSocket. */
export type ChatServerEvent =
	| { type: 'chat:snapshot'; snapshot: ChatSnapshot; viewer: ChatViewer | null; tools: string[] }
	| { type: 'chat:message'; message: ChatMessage }
	| { type: 'chat:delta'; id: string; text: string }
	| { type: 'chat:tools'; id: string; tools: ChatToolUse[] }
	| { type: 'chat:done'; id: string; status: ChatMessage['status']; content: string }
	| { type: 'chat:title'; title: string }
	| { type: 'chat:error'; error: string }
	/** The tools changed, such as when Casey opened or left a table. */
	| { type: 'chat:abilities'; tools: string[] }
	/** Sent only to the person who asked: go to this page of the site. */
	| { type: 'chat:navigate'; path: string };

/** Messages a browser sends: readers who are not signed in send nothing, and only Casey's table page answers table ops. */
export type ChatClientEvent =
	| { type: 'chat:say'; text: string }
	/** Casey's table page, ready to take the assistant's edits. */
	| { type: 'table:ready' }
	/** The page of the site this browser is on now, and the table on it, if any; sent on connect and after each navigation. */
	| { type: 'page:here'; page: ChatPage }
	| import('./table-agent').TableOpReply;

/** Where someone was when they wrote: a path on this site, the page's title, and the table it shows. */
export interface ChatPage {
	path: string;
	title?: string;
	table?: string;
}

/** A page as sent by a browser, cleaned up; null when it isn't a path on this site. */
export function chatPage(value: unknown): ChatPage | null {
	if (!value || typeof value !== 'object') return null;
	const { path, title, table } = value as Record<string, unknown>;
	if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 500) return null;
	return {
		path,
		...(typeof title === 'string' && title.trim() ? { title: title.replace(/\s+/g, ' ').trim().slice(0, 200) } : {}),
		...(typeof table === 'string' && /^[a-z0-9-]{4,40}$/.test(table) ? { table } : {})
	};
}

/** For now chat is Casey's alone: /chat, its sign-in, its sockets and the table overlay need the owner's session. */
export const CHAT_OWNER_ONLY = true;

export const CHAT_MAX_MESSAGE = 4000;
export const CHAT_ID = /^[a-z0-9]{10}$/;

export const chatHref = (id: string) => `/chat/${id}`;

/** The Durable Object binding and the agent's URL name (`/agents/chat-thread/<id>`). */
export const CHAT_AGENT = 'chat-thread';

/** A short title from the first message: its first line, trimmed to about sixty characters. */
export function chatTitle(text: string): string {
	const line = text.replace(/[#>*_`[\]]/g, '').split('\n').map((part) => part.trim()).find(Boolean) ?? 'New chat';
	if (line.length <= 60) return line;
	const cut = line.slice(0, 60);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trimEnd()}…`;
}

/** A model-written title, cleaned up: no thinking, quotes, Markdown or full stop, at most about sixty characters. */
export function threadTitle(text: string): string {
	const line = text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').split('\n').map((part) => part.trim()).find(Boolean) ?? '';
	const clean = line.replace(/[*_`#>]/g, '').replace(/^\s*title:\s*/i, '').replace(/^["'“‘«]+|["'”’»]+$/g, '').replace(/[.。]+$/, '').trim();
	return clean.length >= 3 ? chatTitle(clean) : '';
}

/**
 * The assistant's most recent line, as plain text, for a folded chat to show: the last line of its
 * latest reply with the Markdown taken out, what it's doing while it hasn't written yet, or null
 * before it has answered at all.
 */
export function latestAssistantLine(messages: ChatMessage[]): { text: string; writing: boolean } | null {
	const message = messages.findLast((item) => item.role === 'assistant');
	if (!message) return null;
	const writing = message.status === 'streaming';
	const prose = message.content
		.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
		.replace(/```[\s\S]*?(```|$)/g, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
	const lines = prose
		.split('\n')
		.map((line) => line.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, '').replace(/[*_`~]+/g, '').replace(/\s+/g, ' ').trim())
		.filter((line) => line && !/^[-|:\s]+$/.test(line));
	const last = lines.at(-1);
	if (last) return { text: last, writing };
	const step = message.tools?.findLast((tool) => tool.status === 'running') ?? message.tools?.at(-1);
	if (writing) return { text: step ? `${step.label}…` : 'Thinking…', writing };
	return { text: message.status === 'failed' ? 'The assistant couldn’t answer.' : step?.label ?? '', writing };
}

/** When a thread last moved, briefly: “just now”, “5 min ago”, “3 h ago”, then the date. */
export function chatAgo(at: number, now = Date.now()): string {
	const minutes = Math.round((now - at) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export const PROVIDER_LABELS: Record<ChatProvider, string> = {
	owner: 'Casey',
	indieauth: 'Your website',
	mastodon: 'Mastodon',
	bluesky: 'Bluesky'
};
