/**
 * What the page under the site-wide chat (`SiteChat`, in the root layout) offers it. A table
 * page says which table it shows, its own thread (taken up when no chat is going yet), and
 * how to make the changes the assistant asks for.
 */
import type { ChatSelectionItem } from './chat';
import type { TableOpEvent, TableOpResult } from './table-agent';

export interface ChatTableContext {
	table: string;
	/** The table's own thread, used when there's no chat going yet. */
	thread?: string;
	ontableop: (event: TableOpEvent) => Promise<TableOpResult>;
	/** What is selected on the canvas now, sent with each message so the assistant can act on just that. */
	readonly selection?: ChatSelectionItem[];
	/** Clears the canvas's selection, from the chip above the composer. */
	deselect?: () => void;
}

/** Beside the page, or in a window over its corner. (Full screen is the chat's own page, /chat.) */
export type ChatPlacement = 'sidebar' | 'floating';

class SiteChatState {
	table = $state<ChatTableContext | null>(null);
	/** The last page Casey was on that wasn't /chat: where leaving full screen goes back to. */
	lastPage: string | null = null;
	/** Asked from a /chat page that is leaving full screen: open this chat beside (or over) the page. */
	dock = $state<{ placement: ChatPlacement; thread?: string; draft?: string } | null>(null);
	/** What was written in the composer when the chat changed place, for the next composer to take up. */
	draft = '';
}

export const siteChat = new SiteChatState();

/** Offer a table to the chat while its page is open; returns the function that takes it back. */
export function offerTable(context: ChatTableContext): () => void {
	siteChat.table = context;
	return () => {
		if (siteChat.table === context) siteChat.table = null;
	};
}

/** The words carried over from the composer the chat just left, once. */
export function takeDraft(): string {
	const draft = siteChat.draft;
	siteChat.draft = '';
	return draft;
}

/**
 * A /chat page leaving full screen: asks the site-wide chat to open `thread` in `placement`, and
 * returns the page to go to (the one Casey came from, or home).
 */
export function leaveFullScreen(placement: ChatPlacement, thread?: string, draft?: string): string {
	siteChat.dock = { placement, thread, draft };
	return siteChat.lastPage ?? '/';
}
