import { usePageCommands } from './page-commands.svelte';
import { itemHash } from './table-search';
import { searchTables, tableHref, type TablesMode } from './tables-client';
import type { TableSummary } from './tables';

/** How many tables the palette lists before typing narrows them. */
const LISTED = 60;

/**
 * ⌘K on a tables page: every table by name, and, typing, the things on tables that hold the
 * words. A result opens its table with that thing in view.
 */
export function useTablesCommands(options: () => { tables: TableSummary[]; mode: TablesMode; currentId?: string; onNew?: () => unknown }): void {
	const href = (id: string, mode: TablesMode, item?: string) => `${tableHref(id, mode)}${itemHash(item)}`;
	usePageCommands(() => {
		const { tables, mode, currentId, onNew } = options();
		return [{
			label: 'Tables',
			items: [
				...(currentId ? [{ value: `go:/tables/${mode === 'demo' ? '?owner=demo' : ''}`, label: 'All tables', icon: '🗂️', keywords: ['list', 'browse'] }] : []),
				...(onNew ? [{ value: 'tables:new', label: 'New table', icon: '➕', keywords: ['make', 'create', 'start'] }] : []),
				...tables.filter((table) => table.id !== currentId).slice(0, LISTED).map((table) => ({
					value: `go:${href(table.id, mode)}`,
					label: table.name,
					hint: `${table.count === 1 ? '1 block' : `${table.count} blocks`}${table.published === false ? ' · Draft' : ''}`,
					icon: '🗂️'
				}))
			],
			run: (value) => (value === 'tables:new' ? onNew?.() : undefined),
			search: async (query, signal) =>
				(await searchTables(mode, query, signal)).map((result) => ({
					value: `go:${href(result.table, mode, result.item)}`,
					label: result.label,
					hint: result.item ? [result.table === currentId ? 'On this table' : result.name, result.excerpt].filter(Boolean).join(' · ') : 'Table',
					icon: result.icon
				}))
		}];
	});
}
