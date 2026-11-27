/**
 * The table view Claude shows when `table_open` runs (an MCP App): one of Casey's tables as the
 * live canvas, loaded and saved through calls the host relays to `/mcp`, since a view has no
 * cookies and no socket of its own. Built by `vite.mcp-app.config.ts` into `/mcp-app/`, and loaded
 * by the page `$lib/server/mcp/site` gives the host.
 */
import { onSite, openWith, SITE_ORIGIN } from './site-shims';
import '../app.css';
import { mount, unmount } from 'svelte';
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import TableAppView from '$lib/components/tables/TableAppView.svelte';
import type { TableOpResult } from '$lib/table-agent';
import type { TableViewLink, ViewTurn } from '$lib/table-view-link';

type Table = { id: string; name: string; document: unknown };

const target = document.getElementById('table-view')!;
const app = new App({ name: 'caseyagollan.com table', version: '0.1.0' }, {});
/** This view's own id, so the site can tell it from an older view of the same table. */
const view = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => (byte % 36).toString(36)).join('');

const say = (text: string) => {
	const line = document.createElement('p');
	line.className = 'table-view-message';
	line.textContent = text;
	target.replaceChildren(line);
};

/** One of the view's own tools on the site, by way of the host. */
async function call<T>(name: string, table: string, more: Record<string, unknown> = {}): Promise<T> {
	const result = await app.callServerTool({ name, arguments: { table, view, ...more } });
	if (result.isError) throw new Error(result.content?.find((part) => part.type === 'text')?.text ?? 'The site refused.');
	return (result.structuredContent ?? {}) as T;
}

const linkFor = (table: string): TableViewLink => ({
	save: (patch) => call<{ name: string }>('table_view_save', table, patch),
	next: () => call<ViewTurn>('table_view_next', table),
	done: async (id, result: TableOpResult) => void (await call('table_view_done', table, { id, ...result })),
	link: async () => (await call<{ url: string }>('table_view_link', table)).url
});

let shown: { id: string; component: { flush(): Promise<void> } & Record<string, unknown>; props: { display: { full: boolean; toggle?: () => void } } } | undefined;

function display() {
	const host = app.getHostContext();
	const full = host?.displayMode === 'fullscreen';
	const can = host?.availableDisplayModes?.includes('fullscreen');
	return { full, toggle: can ? () => void app.requestDisplayMode({ mode: full ? 'inline' : 'fullscreen' }).catch(() => {}) : undefined };
}

async function open(id: string) {
	if (shown?.id === id) return;
	say('Opening the table…');
	try {
		const { table, editable } = await call<{ table: Table; editable?: boolean }>('table_view_load', id);
		if (shown) void unmount(shown.component);
		target.replaceChildren();
		const props = $state({ table, origin: SITE_ORIGIN, link: linkFor(id), editable: editable !== false, display: display() });
		shown = { id, props, component: mount(TableAppView, { target, props }) as never };
	} catch (error) {
		say(`The table couldn’t be opened: ${String((error as Error)?.message ?? error)}`);
	}
}

// Set before connecting, so nothing the host sends at once is missed.
app.ontoolresult = (result) => {
	const table = (result.structuredContent as { table?: { id?: unknown } } | undefined)?.table;
	if (typeof table?.id === 'string') void open(table.id);
	else if (result.isError) say('The table couldn’t be opened.');
};
app.onhostcontextchanged = () => {
	if (shown) shown.props.display = display();
};
app.onteardown = async () => {
	await shown?.component.flush();
	return {};
};

say('Opening the table…');
app.connect().then(
	() => {
		openWith((url) => void app.openLink({ url: onSite(url) }).catch(() => {}));
		if (shown) shown.props.display = display();
	},
	() => say('This view couldn’t reach Claude.')
);
