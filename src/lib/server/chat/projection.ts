/**
 * Pi's transcript, as the chat page shows it. Pi keeps entries (a person's message, each
 * model response, each tool result) and a live document (the answer being streamed, the
 * running tools, why the last run failed). Readers see one message per person and one
 * reply per run of the assistant, with its steps in gray: this folds one into the other.
 *
 * Pure, so it is shared by the page's first render and the live socket, and tested alone.
 */
import type { ChatAuthor, ChatMessage, ChatToolUse } from '../../chat';

/** The entry kind people's messages are stored as, with their author in `data`. */
export const SAY_KIND = 'chat.say';

export interface SayData {
	[key: string]: unknown;
	id: string;
	author: ChatAuthor;
	/** Set by the server from the passkey session; gates the Micropub tools. */
	owner: boolean;
	at: number;
	/** What they wrote, as shown; the model's copy starts with who wrote it. */
	text: string;
}

/** The parts of pi's records this reads, loosely typed so tests can build them by hand. */
export interface Entry { id: string; kind: string; model?: readonly unknown[]; data?: unknown }
interface Text { type: 'text'; text: string }
interface Call { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
interface Assistant { role: 'assistant'; content: (Text | Call | { type: string })[]; model?: string; timestamp?: number; stopReason?: string; errorMessage?: string }
interface ToolResult { role: 'toolResult'; toolCallId: string; toolName: string; content: { type: string; text?: string }[]; isError: boolean }
export interface Live {
	run?: unknown;
	generation?: { message?: Assistant; retry?: { at: number; error: string } };
	tools?: { callId: string; name: string; status: 'pending' | 'running' | 'done' }[];
	runFailure?: { reason: string; detail?: string };
}

const FAILURES: Record<string, string> = {
	model_error: 'the model answered with an error',
	no_model: 'the chat model isn’t set up here yet',
	aborted: 'it was stopped',
	interrupted: 'the server restarted mid-answer',
	restart_limit: 'the server kept restarting',
	turn_limit: 'it took too many steps',
	faulted: 'something went wrong',
	orphaned: 'something went wrong'
};

const textOf = (content: { type: string; text?: string }[] | string) => typeof content === 'string' ? content : content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('');
const isSay = (entry: Entry): entry is Entry & { data: SayData } => entry.kind === SAY_KIND && !!entry.data && typeof (entry.data as SayData).id === 'string';

/**
 * One message per person's input; one assistant reply per stretch of responses and tool
 * results between them. The reply's id follows the input it answers, so it stays stable
 * while it streams. The live document fills in the stretch still being written.
 */
export function projectMessages(entries: readonly Entry[], live: Live = {}, now = Date.now()): ChatMessage[] {
	const messages: ChatMessage[] = [];
	let reply: ChatMessage | undefined;
	const calls = new Map<string, { use: ChatToolUse; args: Record<string, unknown> }>();
	let lastSay: string | undefined;

	const open = (at: number, model?: string): ChatMessage => {
		reply ??= { id: `r-${lastSay ?? 'start'}`, role: 'assistant', content: '', tools: [], status: 'done', createdAt: at, ...(model ? { model } : {}) };
		if (!messages.includes(reply)) messages.push(reply);
		return reply;
	};
	const append = (message: ChatMessage, text: string) => {
		if (!text.trim()) return;
		message.content = message.content ? `${message.content.trimEnd()}\n\n${text.trimStart()}` : text;
	};

	for (const entry of entries) {
		const message = entry.model?.[0] as Assistant | ToolResult | { role: string; content: unknown; timestamp?: number } | undefined;
		if (isSay(entry)) {
			reply = undefined;
			lastSay = entry.data.id;
			const said = typeof entry.data.text === 'string' ? entry.data.text : message && 'content' in message ? textOf(message.content as Text[] | string) : '';
			messages.push({ id: entry.data.id, role: 'user', content: said, author: entry.data.author, status: 'done', createdAt: entry.data.at });
		} else if (message?.role === 'assistant') {
			const assistant = message as Assistant;
			const target = open(assistant.timestamp ?? now, assistant.model);
			append(target, assistant.content.filter((part): part is Text => part.type === 'text').map((part) => part.text).join(''));
			for (const part of assistant.content) {
				if (part.type !== 'toolCall') continue;
				const call = part as Call;
				const use: ChatToolUse = { tool: call.name, label: toolLabel(call.name, call.arguments ?? {}), status: 'running' };
				target.tools!.push(use);
				calls.set(call.id, { use, args: call.arguments ?? {} });
			}
			if (assistant.stopReason === 'error' && assistant.errorMessage) target.status = 'failed';
		} else if (message?.role === 'toolResult') {
			const result = message as ToolResult;
			const call = calls.get(result.toolCallId);
			if (!call) continue;
			call.use.status = result.isError ? 'failed' : 'done';
			if (!result.isError && (result.toolName === 'search_site' || result.toolName === 'fetch_page')) {
				const links = linksFrom(result.toolName, textOf(result.content));
				if (links.length) call.use.links = links;
			}
		}
	}

	// The stretch being written now: streamed text, and which of its tools are still running.
	if (live.run) {
		const target = open(live.generation?.message?.timestamp ?? now, live.generation?.message?.model);
		target.status = 'streaming';
		const partial = live.generation?.message?.content?.filter((part): part is Text => part.type === 'text').map((part) => part.text).join('') ?? '';
		append(target, partial);
		for (const slot of live.tools ?? []) {
			const call = calls.get(slot.callId);
			if (call && slot.status !== 'done') call.use.status = 'running';
		}
	} else if (live.runFailure && reply) {
		reply.status = 'failed';
		const why = FAILURES[live.runFailure.reason] ?? 'something went wrong';
		append(reply, `*The answer stopped: ${why}.*`);
	} else if (live.runFailure && messages.at(-1)?.role === 'user') {
		const failed = open(now);
		failed.status = 'failed';
		append(failed, `*The answer stopped: ${FAILURES[live.runFailure.reason] ?? 'something went wrong'}.*`);
	}

	// Steps left `running` by a finished run were cut off.
	for (const message of messages) {
		if (message.role === 'assistant' && message.status !== 'streaming') for (const use of message.tools ?? []) if (use.status === 'running') use.status = 'failed';
		if (message.role === 'assistant' && !message.tools?.length) delete message.tools;
	}
	return messages;
}

/** What readers see for a step: the query, the address, or what Micropub was asked to do. */
export function toolLabel(name: string, args: Record<string, unknown>): string {
	if (name === 'search_site') return `Searched the site for “${String(args.query ?? '').slice(0, 80)}”`;
	if (name === 'fetch_page') { try { const url = new URL(String(args.url)); return `Read ${url.host}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 100); } catch { return `Read ${String(args.url ?? '').slice(0, 80)}`; } }
	if (name === 'micropub_create_post') return args.post_status === 'published' ? 'Published a post' : 'Saved a draft';
	if (name === 'micropub_update_post') return 'Updated a post';
	if (name === 'micropub_list_posts') return 'Looked through recent posts';
	if (name === 'micropub_get_post') return 'Opened a post';
	if (name === 'micropub_config') return 'Checked the Micropub setup';
	return name.replace(/_/g, ' ');
}

/** Public links from a public tool's output, for the reader to follow. Never Micropub output. */
export function linksFrom(name: string, output: string): { url: string; title: string }[] {
	try {
		if (name === 'search_site') return (JSON.parse(output) as { url: string; title: string }[]).slice(0, 5).map(({ url, title }) => ({ url, title }));
		const title = /^# (.+)$/m.exec(output)?.[1], url = /^URL: (.+)$/m.exec(output)?.[1];
		return url ? [{ url, title: title ?? url }] : [];
	} catch { return []; }
}

/**
 * What to send a watching browser so its copy matches `next`: new or reshaped messages
 * whole, growing text as deltas, a finished reply as `done`.
 */
export function diffMessages(previous: readonly ChatMessage[], next: readonly ChatMessage[]): import('../../chat').ChatServerEvent[] {
	const before = new Map(previous.map((message) => [message.id, message]));
	const events: import('../../chat').ChatServerEvent[] = [];
	for (const message of next) {
		const old = before.get(message.id);
		if (!old) { events.push({ type: 'chat:message', message }); continue; }
		const toolsChanged = JSON.stringify(old.tools ?? []) !== JSON.stringify(message.tools ?? []);
		if (toolsChanged) events.push({ type: 'chat:tools', id: message.id, tools: message.tools ?? [] });
		if (message.status !== 'streaming' && (old.status !== message.status || old.content !== message.content)) {
			events.push({ type: 'chat:done', id: message.id, status: message.status, content: message.content });
		} else if (message.content !== old.content) {
			if (message.content.startsWith(old.content)) events.push({ type: 'chat:delta', id: message.id, text: message.content.slice(old.content.length) });
			else events.push({ type: 'chat:message', message });
		}
	}
	return events;
}
