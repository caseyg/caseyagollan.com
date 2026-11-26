/**
 * Pi's transcript, as the chat page shows it. Pi keeps entries (a person's message, each
 * model response, each tool result) and a live document (the answer being streamed, the
 * running tools, why the last run failed). Readers see one message per person and one
 * reply per run of the assistant, with its steps in gray: this folds one into the other.
 *
 * Pure, so it is shared by the page's first render and the live socket, and tested alone.
 */
import type { ChatAuthor, ChatMessage, ChatSelection, ChatToolUse } from '../../chat';

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
	/** What Casey had selected on the table (the first few described), shown beside the message. */
	selection?: ChatSelection;
}

/** The parts of pi's records this reads, loosely typed so tests can build them by hand. */
export interface Entry { id: string; kind: string; model?: readonly unknown[]; data?: unknown }
interface Text { type: 'text'; text: string }
interface Call { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
interface Assistant { role: 'assistant'; content: (Text | Call | { type: string })[]; model?: string; timestamp?: number; stopReason?: string; errorMessage?: string }
interface ToolResult { role: 'toolResult'; toolCallId: string; toolName: string; content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError: boolean }
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
			const selection = entry.data.selection;
			messages.push({ id: entry.data.id, role: 'user', content: said, author: entry.data.author, status: 'done', createdAt: entry.data.at, ...(selection?.count ? { selection } : {}) });
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
			if (!result.isError && (result.toolName === 'table_look' || result.toolName === 'view_image')) {
				const picture = pictureFrom(result.toolName, call.args, result.content);
				if (picture) call.use.picture = picture;
			}
			if (!result.isError && result.toolName === 'show_page') {
				const peek = peekFrom(textOf(result.content));
				if (peek) { call.use.peek = peek; call.use.label = `Showed ${peek.title}`.slice(0, 100); }
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
	if (name === 'search_site') {
		const query = String(args.query ?? '').trim().slice(0, 80);
		if (query) return `Searched the site for “${query}”`;
		const kind = typeof args.type === 'string' && args.type !== 'post' ? `${args.type === 'reply' ? 'replie' : args.type}s` : 'posts';
		const when = Number(args.days) > 0 ? ` from the last ${Number(args.days) === 1 ? 'day' : `${Math.round(Number(args.days))} days`}` : typeof args.since === 'string' ? ` since ${args.since.slice(0, 10)}` : typeof args.until === 'string' ? ` up to ${args.until.slice(0, 10)}` : '';
		return `Looked through ${when ? '' : 'the newest '}${kind}${when}${typeof args.tag === 'string' && args.tag ? ` tagged ${args.tag.slice(0, 40)}` : ''}`;
	}
	if (name === 'fetch_page' && !String(args.url ?? '').trim()) return 'Read this page';
	if (name === 'fetch_page') { try { const url = new URL(String(args.url)); return `Read ${url.host}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 100); } catch { return `Read ${String(args.url ?? '').slice(0, 80)}`; } }
	if (name === 'micropub_create_post') return args.post_status === 'published' ? 'Published a post' : 'Saved a draft';
	if (name === 'micropub_update_post') return 'Updated a post';
	if (name === 'micropub_list_posts') return args.drafts_only ? 'Looked for drafts' : 'Looked through recent posts';
	if (name === 'micropub_get_post') return 'Opened a post';
	if (name === 'micropub_config') return 'Checked the Micropub setup';
	if (name === 'show_page') return `Opened a preview of ${String(args.url ?? '').replace(/^https?:\/\//, '').slice(0, 80)}`;
	if (name === 'go_to') return `Took you to ${String(args.path ?? '').slice(0, 80)}`;
	if (name === 'create_table' || name === 'table_new') return `Made a table, “${String(args.name ?? '').slice(0, 60)}”`;
	if (name === 'table_add') {
		const items = Array.isArray(args.items) ? args.items as Record<string, unknown>[] : [];
		const notes = items.filter((item) => typeof item?.note === 'string' || typeof item?.text === 'string').length, links = items.filter((item) => typeof item?.url === 'string').length;
		const searches = items.filter((item) => typeof item?.search === 'string').map((item) => `“${String(item.search).slice(0, 40)}”`);
		const places = items.filter((item) => typeof item?.source === 'string' && typeof item?.in === 'string' && item.in).map((item) => `“${String(item.in).slice(0, 40)}”`);
		const parts = [notes ? `${notes} note${notes === 1 ? '' : 's'}` : '', links ? `${links} link${links === 1 ? '' : 's'}` : '', searches.length && !places.length ? `results for ${searches.join(', ')}` : '', places.length ? `everything in ${places.join(', ')}` : ''].filter(Boolean);
		return `Added ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1') || 'to the table'}`.slice(0, 120);
	}
	if (name === 'my_saves') {
		const source = ({ arena: 'Are.na', raindrop: 'Raindrop', readwise: 'Readwise' } as Record<string, string>)[String(args.source ?? '').toLowerCase()] ?? 'saves';
		const place = typeof args.in === 'string' && args.in ? ` “${args.in.slice(0, 50)}”` : '';
		if (args.item) return `Read one ${source} item`;
		if (typeof args.query === 'string' && args.query) return `Searched ${source}${place} for “${args.query.slice(0, 40)}”`;
		return place ? `Read ${source}${place}` : `Listed ${source}`;
	}
	if (name === 'table_pull') {
		const blocks = Array.isArray(args.blocks) ? args.blocks.filter((one) => typeof one === 'string' && one.trim()) : [];
		const what = args.images === false ? 'quotes' : args.quotes === false ? 'pictures' : 'pictures and quotes';
		const from = blocks.some((one) => /^(all|everything|the whole table)$/i.test(String(one).trim())) ? 'the whole table' : blocks.length ? count(blocks, 'block') : 'the selected blocks';
		return `Context pull: ${what} from ${from}`;
	}
	if (name === 'table_read') return Array.isArray(args.ids) && args.ids.length ? `Read ${count(args.ids, 'item')}` : 'Read the table';
	if (name === 'table_look') return 'Looked at the table';
	if (name === 'table_connect') { const n = Array.isArray(args.links) ? args.links.length : 0; return `Drew ${n === 1 ? 'an arrow' : `${n} arrows`}`; }
	if (name === 'table_draw') return Array.isArray(args.strokes) && args.strokes.some((stroke) => (stroke as { around?: unknown })?.around) ? 'Circled something' : 'Drew on the table';
	if (name === 'table_frame') return `Framed ${args.ids ? count(args.ids, 'item') : 'a space'} as “${String(args.name ?? '').slice(0, 60)}”`;
	if (name === 'table_group') return typeof args.name === 'string' && args.name && !args.ungroup ? `Framed ${count(args.ids, 'item')} as “${args.name.slice(0, 60)}”` : `${args.ungroup ? 'Ungrouped' : 'Grouped'} ${count(args.ids, 'item')}`;
	if (name === 'table_edit') {
		const parts = [Array.isArray(args.edits) && args.edits.length ? `edited ${count(args.edits, 'item')}` : '', Array.isArray(args.remove) && args.remove.length ? `removed ${count(args.remove, 'item')}` : '', typeof args.rename === 'string' && args.rename ? `renamed the table “${args.rename.slice(0, 60)}”` : ''].filter(Boolean).join(', ');
		return parts ? parts[0].toUpperCase() + parts.slice(1) : 'Edited the table';
	}
	if (name === 'table_tidy') return `Tidied ${args.ids ? count(args.ids, 'item') : 'the table'}`;
	if (name === 'table_align') return `${args.align ? 'Lined up' : 'Spaced out'} ${count(args.ids, 'item')}`;
	if (name === 'view_image') return `Looked at ${String(args.url ?? '').replace(/^https?:\/\//, '').slice(0, 80)}`;
	if (name === 'table_add_from_search') return `Added results for “${String(args.query ?? '').slice(0, 60)}”`;
	if (name === 'table_add_links') return `Added ${count(args.urls, 'link')}`;
	if (name === 'table_add_note') return args.style === 'text' ? 'Added some text' : 'Added a note';
	if (name === 'table_move') return `Moved ${count(args.moves, 'item')}`;
	if (name === 'table_arrange' && (args.layout === 'tidy' || !args.layout)) return args.layout === 'tidy' ? `Tidied ${args.ids ? count(args.ids, 'item') : 'the table'}` : `${args.align ? 'Lined up' : 'Spaced out'} ${count(args.ids, 'item')}`;
	if (name === 'table_arrange') {
		const what = args.inside ? 'a frame' : args.ids ? count(args.ids, 'item') : 'the table';
		const how: Record<string, string> = { pack: 'packed together', columns: 'in columns', row: 'in a row', column: 'in a column', tree: 'as a tree', mindmap: 'as a mind map', radial: 'in rings', layered: 'as a flow', force: 'as a network', cluster: 'into groups', auto: '' };
		return args.layout === 'auto' ? `Tidied up ${what}` : `Arranged ${what} ${how[String(args.layout)] ?? 'in a grid'}`;
	}
	if (name === 'table_remove') return `Removed ${count(args.ids, 'item')}`;
	if (name === 'table_select') return `Pointed out ${count(args.ids, 'item')}`;
	if (name === 'table_rename') return `Renamed the table “${String(args.name ?? '').slice(0, 60)}”`;
	return name.replace(/_/g, ' ');
}

/** “3 items”, or “the selected items” when the model named Casey's selection rather than ids. */
const count = (list: unknown, noun: string) => {
	const all = Array.isArray(list) ? list : [];
	if (all.some((one) => typeof one === 'string' && /^(selected|selection|the selection|these|those)$/i.test(one.trim()))) return `the selected ${noun}s`;
	if (all.some((one) => typeof (one as { id?: unknown } | null)?.id === 'string' && /^selected$/i.test(String((one as { id: string }).id).trim()))) return `the selected ${noun}s`;
	return `${all.length} ${noun}${all.length === 1 ? '' : 's'}`;
};

/**
 * What readers see of a picture the assistant looked at: the table snapshot itself (a small
 * JPEG it drew), or the address of the image it fetched, never the fetched bytes.
 */
export function pictureFrom(name: string, args: Record<string, unknown>, content: ToolResult['content']): ChatToolUse['picture'] | undefined {
	if (name === 'view_image') {
		const url = /^The picture at (\S+):$/.exec(content.find((part) => part.type === 'text')?.text ?? '')?.[1] ?? String(args.url ?? '');
		return /^https?:\/\//.test(url) ? { src: url, alt: 'The picture the assistant looked at' } : undefined;
	}
	const image = content.find((part) => part.type === 'image' && part.mimeType === 'image/jpeg' && typeof part.data === 'string');
	return image ? { src: `data:image/jpeg;base64,${image.data}`, alt: 'What the assistant saw of the table, each item numbered' } : undefined;
}

/** The preview `show_page` made: a page's address, title and opening lines. */
export function peekFrom(output: string): ChatToolUse['peek'] | undefined {
	try {
		const { url, title, excerpt } = JSON.parse(output) as { url?: unknown; title?: unknown; excerpt?: unknown };
		if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return undefined;
		return { url, title: typeof title === 'string' && title ? title.slice(0, 200) : url, ...(typeof excerpt === 'string' && excerpt ? { excerpt: excerpt.slice(0, 240) } : {}) };
	} catch { return undefined; }
}

/** Public links from a public tool's output, for the reader to follow. Never Micropub output. */
export function linksFrom(name: string, output: string): { url: string; title: string }[] {
	try {
		if (name === 'search_site') {
			// Older threads hold a bare list; the tool now answers `{ total, results }`.
			const found = JSON.parse(output) as { url: string; title: string }[] | { results?: { url: string; title: string }[] };
			return (Array.isArray(found) ? found : found.results ?? []).slice(0, 5).map(({ url, title }) => ({ url, title }));
		}
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
