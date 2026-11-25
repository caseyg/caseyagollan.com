/**
 * A stand-in for Casey's open table page, for replays: it keeps items in memory and answers the
 * same operations the real canvas does (`TableApi.perform` and the table page), with the real
 * layout maths and roughly real sizes. No drawing.
 */
import { columnLayout, columnsLayout, gridLayout, layoutIssues, rowLayout, tidyLayout, type Box, type Placement } from '../../src/lib/table-layout';
import { loadAgentIndex, searchDocuments } from '../../src/lib/server/chat/site-search';
import { parseHTML } from 'linkedom';
import { pickPieces, piecesFrom, piecesPath, quoteSize } from '../../src/lib/table-pieces';
import { remotePagePieces } from '../../src/lib/server/table-pieces';
import type { Block } from '../../src/lib/tables';

const SITE = 'https://caseyagollan.com';

/** A block's pieces as Casey's page finds them: this site's pages read live and taken apart, others through defuddle. */
async function livePieces(block: Pick<Block, 'kind' | 'url'>): Promise<Block[]> {
	const path = piecesPath(block) ?? (block.url.startsWith(SITE) ? piecesPath({ kind: block.kind, url: block.url.slice(SITE.length) }) : null);
	if (path) {
		const response = await fetch(new URL(path, SITE));
		return response.ok ? piecesFrom(parseHTML(await response.text()).document as unknown as Document, path, SITE) : [];
	}
	return /^https?:/.test(block.url) ? remotePagePieces(block.url).catch(() => []) : [];
}

export interface FakeItem { id: string; type: string; title?: string; url?: string; text?: string; from?: string; to?: string; parent?: string; x: number; y: number; w: number; h: number }
type Op = { op: string } & Record<string, any>;

const noteHeight = (text: string) => text.length <= 120 ? 200 : 200 + Math.ceil((text.length - 120) / 24) * 24;
const textHeight = (text: string, w: number) => 40 + Math.ceil(text.length / Math.max(8, w / 9)) * 28;
const SOLID = (item: FakeItem) => !['arrow', 'draw'].includes(item.type);

export function fakeTable(start: FakeItem[], selected: string[] = []) {
	const items: FakeItem[] = start.map((item) => ({ ...item }));
	let next = 1;
	let name = 'Table';
	const id = () => `s${next++}`;
	const boxes = (list: FakeItem[]): Box[] => list.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
	const named = (ids?: string[]) => ids?.length ? items.filter((item) => ids.includes(item.id)) : items.filter((item) => item.type !== 'arrow' && !item.parent);
	const place = (placements: Placement[]) => { for (const { id, x, y } of placements) { const item = items.find((one) => one.id === id); if (item) { item.x = x; item.y = y; } } return placements.length; };
	const issues = () => layoutIssues(boxes(items.filter(SOLID).filter((item) => item.type !== 'frame')));
	const changed = (result: Record<string, unknown>) => { const found = issues(); return { ...result, ...(!found.overlaps.length && !found.crowded.length ? { layout: 'no overlaps' } : { issues: found }) }; };
	const openSpot = (w: number, h: number) => { const solid = items.filter(SOLID); return solid.length ? { x: Math.max(...solid.map((item) => item.x + item.w)) + 20, y: Math.min(...solid.map((item) => item.y)) } : { x: 0, y: 0 }; };
	const addBlocks = (blocks: { title: string; url: string; kind: string; excerpt?: string }[], at?: { x: number; y: number }, columns = 3) => {
		const origin = at ?? openSpot(240, 240);
		return blocks.map((block, index) => {
			const size = block.kind === 'quote' ? quoteSize(block.excerpt ?? '') : block.kind === 'book' ? { w: 180, h: 300 } : { w: 240, h: 240 };
			const item: FakeItem = { id: id(), type: block.kind, title: block.title, url: block.url, ...(block.excerpt ? { text: block.excerpt } : {}), x: origin.x + (index % columns) * 340, y: origin.y + Math.floor(index / columns) * 480, ...size };
			items.push(item);
			return item;
		});
	};
	const newNote = (note: { text: string; style?: string; w?: number }, at: { x: number; y: number }) => {
		const w = note.style === 'text' ? Math.max(160, Math.min(800, note.w ?? 360)) : 200;
		const item: FakeItem = { id: id(), type: note.style === 'text' ? 'text' : 'note', text: note.text, x: at.x, y: at.y, w, h: note.style === 'text' ? textHeight(note.text, w) : noteHeight(note.text) };
		items.push(item);
		return item;
	};
	const anchor = (op: Op) => {
		const target = items.find((item) => item.id === (op.below ?? op.right_of));
		return target ? (op.below ? { x: target.x, y: target.y + target.h + 20 } : { x: target.x + target.w + 20, y: target.y }) : op.at;
	};

	async function perform(op: Op): Promise<unknown> {
		switch (op.op) {
			case 'read': return { name, items: items.map((item) => ({ ...item, ...(item.text ? { text: item.text.slice(0, 400) } : {}) })), selected, issues: issues() };
			case 'add_pieces': {
				const source = items.find((item) => item.id === op.block);
				if (!source?.url) throw new Error(`${op.block} isn’t a block on the table.`);
				const { picked, more } = pickPieces((await livePieces({ kind: source.type as Block['kind'], url: source.url })).filter((piece) => !items.some((item) => item.url === piece.url && item.type === piece.kind)), op);
				if (!picked.length) return { source: source.title, added: [], note: 'Its page has no pictures or passages that aren’t on the table already.' };
				const added = addBlocks(picked, { x: source.x + source.w + 20, y: source.y }, Math.min(picked.length, 3));
				return { source: source.title, added: added.map((item, index) => ({ id: item.id, kind: item.type, text: (picked[index].excerpt ?? picked[index].title).slice(0, 80) })), more };
			}
			case 'look': return items.length ? { image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', width: 1, height: 1, key: items.filter(SOLID).map((item, index) => ({ n: index + 1, id: item.id, type: item.type, title: (item.title ?? item.text ?? '').slice(0, 60) })), issues: issues() } : { empty: true };
			case 'add_from_search': {
				const found = searchDocuments(await loadAgentIndex(undefined, 'https://caseyagollan.com/'), op.query, { limit: op.limit ?? 6 })
					.filter((result) => !op.filter || op.filter === 'all' || (op.filter === 'post' ? !['book', 'wiki', 'arena'].includes(result.type) : result.type === op.filter))
					.filter((result) => !items.some((item) => item.url === result.url));
				if (!found.length) return { added: [], note: 'Nothing new matched.' };
				const added = addBlocks(found.map((result) => ({ title: result.title, url: result.url, kind: ['book', 'wiki', 'arena'].includes(result.type) ? result.type : 'post', excerpt: result.excerpt.slice(0, 200) })), op.at, op.columns ?? Math.min(found.length, 3));
				return { added: added.map(({ id, title, url }) => ({ id, title, url })) };
			}
			case 'add_links': {
				const added = addBlocks((op.urls as string[]).map((url) => ({ title: url.replace(/^https?:\/\//, ''), url, kind: /caseyagollan\.com|^\//.test(url) ? 'post' : 'link' })), op.at, op.columns ?? Math.min(op.urls.length, 3));
				return { added: added.map((item) => item.id) };
			}
			case 'add_blocks': return changed({ added: addBlocks(op.blocks, op.at, op.columns ?? 4).map((item) => item.id) });
			case 'add_note': {
				const item = newNote(op as never, anchor(op) ?? openSpot(200, 200));
				place(tidyLayout(boxes(named()), 20, item.id));
				return changed({ added: [{ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h }] });
			}
			case 'add_notes': {
				const origin = anchor(op) ?? openSpot(200, 200);
				const cells = (op.notes as { text: string; style?: string; w?: number; blank?: boolean }[]).map((note) => note.blank ? null : newNote(note, origin));
				const made = cells.filter((cell): cell is FakeItem => !!cell);
				// A blank keeps its cell and makes nothing; every box starts at one point, so reading order is the order given.
				const set = cells.map((cell, index) => cell ? { id: cell.id, x: 0, y: 0, w: cell.w, h: cell.h } : { id: `blank-${index}`, x: 0, y: 0, w: 200, h: 0 });
				const columns = Math.max(1, op.columns ?? Math.min(set.length, 4));
				place(op.layout === 'row' ? rowLayout(set, origin) : op.layout === 'column' ? columnLayout(set, origin) : op.layout === 'columns' ? columnsLayout(set, columns, origin) : gridLayout(set, columns, origin));
				return changed({ added: made.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) });
			}
			case 'move': {
				let moved = 0;
				for (const move of op.moves as Partial<FakeItem>[]) { const item = items.find((one) => one.id === move.id); if (!item) continue; moved++; Object.assign(item, { x: move.x ?? item.x, y: move.y ?? item.y, w: move.w ?? item.w, h: item.type === 'text' ? item.h : move.h ?? item.h }); }
				return changed({ moved });
			}
			case 'arrange': {
				const list = named(op.ids).filter(SOLID);
				const columns = Math.max(1, op.columns ?? Math.ceil(Math.sqrt(list.length)));
				const gap = op.gap ?? 20;
				place(op.layout === 'row' ? rowLayout(boxes(list), op.at, gap) : op.layout === 'column' ? columnLayout(boxes(list), op.at, gap) : op.layout === 'columns' ? columnsLayout(boxes(list), columns, op.at, gap) : gridLayout(boxes(list), columns, op.at, gap));
				return changed({ arranged: list.length });
			}
			case 'align': {
				const list = named(op.ids).filter(SOLID);
				if (list.length < 2) return { aligned: 0, note: 'Name at least two items.' };
				if (op.align === 'left') { const x = Math.min(...list.map((item) => item.x)); for (const item of list) item.x = x; }
				if (op.align === 'top') { const y = Math.min(...list.map((item) => item.y)); for (const item of list) item.y = y; }
				return changed({ aligned: list.length });
			}
			case 'tidy': return changed({ moved: place(tidyLayout(boxes(named(op.ids).filter(SOLID)))) });
			case 'connect': {
				const added: string[] = [], missing: string[] = [];
				for (const link of op.links as { from: string; to: string; label?: string }[]) {
					const from = items.find((item) => item.id === link.from), to = items.find((item) => item.id === link.to);
					if (!from || !to || from === to) { missing.push(`${link.from}→${link.to}`); continue; }
					const arrow: FakeItem = { id: id(), type: 'arrow', from: from.id, to: to.id, ...(link.label ? { text: link.label } : {}), x: from.x, y: from.y, w: 1, h: 1 };
					items.push(arrow);
					added.push(arrow.id);
				}
				return changed({ added, ...(missing.length ? { not_found: missing } : {}) });
			}
			case 'draw': { const added = (op.strokes as unknown[]).map(() => { const item: FakeItem = { id: id(), type: 'draw', x: 0, y: 0, w: 1, h: 1 }; items.push(item); return item.id; }); return { added }; }
			case 'frame': {
				const inside = op.ids?.length ? named(op.ids) : [];
				const x = inside.length ? Math.min(...inside.map((item) => item.x)) - 40 : op.at?.x ?? 0, y = inside.length ? Math.min(...inside.map((item) => item.y)) - 40 : op.at?.y ?? 0;
				const frame: FakeItem = { id: id(), type: 'frame', text: op.name, x, y, w: inside.length ? Math.max(...inside.map((item) => item.x + item.w)) + 40 - x : op.w ?? 400, h: inside.length ? Math.max(...inside.map((item) => item.y + item.h)) + 40 - y : op.h ?? 300 };
				items.push(frame);
				for (const item of inside) item.parent = frame.id;
				return changed({ added: [frame.id], holds: inside.map((item) => item.id) });
			}
			case 'group': { const list = named(op.ids); if (list.length < 2) return { grouped: 0, note: 'Name at least two items.' }; const group = id(); for (const item of list) item.parent = group; return { group, holds: list.map((item) => item.id) }; }
			case 'ungroup': { for (const item of items) if (op.ids.includes(item.parent)) delete item.parent; const gone = items.filter((item) => item.type === 'frame' && op.ids.includes(item.id)); for (const frame of gone) items.splice(items.indexOf(frame), 1); return { ungrouped: op.ids.length }; }
			case 'edit': { let edited = 0; for (const change of op.edits as { id: string; text?: string }[]) { const item = items.find((one) => one.id === change.id); if (!item || item.url) continue; if (change.text !== undefined) { item.text = change.text; if (item.type === 'note') item.h = noteHeight(change.text); if (item.type === 'text') item.h = textHeight(change.text, item.w); } edited++; } return changed({ edited }); }
			case 'remove': { const gone = items.filter((item) => op.ids.includes(item.id) || op.ids.includes(item.from) || op.ids.includes(item.to)); for (const item of gone) items.splice(items.indexOf(item), 1); return { removed: gone.length }; }
			case 'select': return { selected: named(op.ids).length };
			case 'rename': name = op.name; return { name };
		}
		throw new Error(`The table doesn’t know “${op.op}”.`);
	}
	return { perform, items: () => items.map((item) => ({ ...item })) };
}
