/**
 * The changes the assistant asks of a table that the page around the canvas makes, because they
 * start with a lookup the canvas doesn't do: search results, links, and a block given another
 * link. Shared by the table page and the table view inside Claude (`src/mcp-app/`), so both add
 * the same rich blocks. What only the table page can do (a page's pieces, PDF pages, tags) stays there.
 */
import type { TableApi } from './components/tables/canvas/TableEditor';
import type { TableItem, TableOp, TableOpResult } from './table-agent';
import { linkedBlock, type searchBlocks } from './table-sources';
import { blockKey, type Block } from './tables';

export interface PageOps {
	api: TableApi;
	/** The keys (`blockKey`) of the blocks on the table now. */
	placed: () => readonly string[];
	search: typeof searchBlocks;
	/** The site's address, which its own pages' links are told from others by. */
	origin: string;
}

type Looked = Extract<TableOp, { op: 'add_from_search' | 'add_links' | 'relink' }>;
export const isLookupOp = (op: TableOp): op is Looked => op.op === 'add_from_search' || op.op === 'add_links' || op.op === 'relink';

export async function lookupOp(op: Looked, { api, placed, search, origin }: PageOps): Promise<TableOpResult> {
	const bare = (id: string) => id.replace(/^shape:/, '');
	switch (op.op) {
		case 'add_from_search': {
			const there = new Set(placed());
			const found = ((await search(op.query, op.filter ?? 'all')) ?? []).filter((block) => !there.has(blockKey(block))).slice(0, op.limit ?? 6);
			if (!found.length) return { ok: true, result: { added: [], note: 'Nothing new matched.' } };
			const ids = api.addBlocks(found, op.at, { columns: op.columns ?? Math.min(found.length, 3), page: !!op.at, select: true });
			return { ok: true, result: { added: ids.map((shapeId, index) => ({ id: bare(shapeId), title: found[index]?.title, url: found[index]?.url })) } };
		}
		case 'add_links': {
			const blocks = (await Promise.all(op.urls.map((url) => linkedBlock(url, op.find?.[url], origin)))).filter((block): block is Block => !!block);
			if (!blocks.length) return { ok: false, error: 'None of those were links.' };
			const ids = api.addBlocks(blocks, op.at, { columns: op.columns ?? Math.min(blocks.length, 3), page: !!op.at, select: true });
			return { ok: true, result: { added: ids.map(bare) } };
		}
		case 'relink': {
			const { items } = (await api.perform({ op: 'read' })) as { items: TableItem[] };
			const found = await Promise.all(op.links.map(async ({ id, url }) => {
				const was = items.find((one) => one.id === bare(id));
				const block = was?.url ? await linkedBlock(url, op.find?.[url], origin) : null;
				if (!was || !block) return null;
				// A page nothing more is known about keeps the card's own title and picture: only where it leads changes.
				const plain = block.kind === 'link' && !block.excerpt && !block.image;
				return { id: was.id, block: plain ? { ...block, title: was.title ?? block.title, ...(was.image ? { image: was.image } : {}) } : block };
			}));
			const blocks = found.filter((one): one is { id: string; block: Block } => !!one);
			const skipped = op.links.filter((_, index) => !found[index]).map((link) => link.id);
			if (!blocks.length) return { ok: false, error: 'None of those are blocks with a link.' };
			const result = (await api.perform({ op: 'set_blocks', cards: blocks })) as { relinked: number; skipped?: string[] };
			return { ok: true, result: { ...result, ...(skipped.length || result.skipped?.length ? { skipped: [...skipped, ...(result.skipped ?? [])] } : {}) } };
		}
	}
}
