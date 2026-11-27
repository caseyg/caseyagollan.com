/**
 * How a table canvas that has no socket and no cookies (the table view inside Claude, an MCP App)
 * talks to the site: a few calls its host relays to `/mcp`. `src/mcp-app/table-view.ts` makes the
 * real one; stories and tests pass their own.
 */
import type { TableOpEvent, TableOpResult } from './table-agent';

export type ViewTurn =
	/** A change to make, and any earlier ones to drop unmade because their tool stopped waiting. */
	| { op: TableOpEvent; cancel?: string[] }
	| { cancel?: string[] }
	/** A newer view of this table has opened: stop editing and saving. */
	| { replaced: true };

export interface TableViewLink {
	save(patch: { document?: unknown; name?: string }): Promise<{ name: string }>;
	/** Waits for the next change asked of the table; resolves with none when nothing came. */
	next(): Promise<ViewTurn>;
	done(id: string, result: TableOpResult): Promise<void>;
}

/** Where a view shows: in the conversation, or over all of it. `toggle` is unset where the host offers no choice. */
export interface ViewDisplay {
	full: boolean;
	toggle?: () => void;
}
