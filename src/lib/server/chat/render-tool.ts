/**
 * The /chat assistant's `table_render` (Casey's runs only): a source as pictures on the table.
 * A PDF becomes its pages, drawn by pdf.js on Casey's open table page and kept in R2; a web page
 * becomes one screenshot of the whole page, top to bottom, taken with Browser Rendering. One tool
 * for both, since whether an address is a PDF is this tool's to find out, not the model's.
 *
 * Sources are blocks on the table (ids, words from their titles, or Casey's selection) or plain
 * addresses. Only public https addresses are fetched or captured. What was made is set beside its
 * block and joined to it by an arrow, as context pull does: a PDF's pages in a frame of their own.
 */
import type { ToolRegistration } from '@earendil-works/pi-durable';
import type { TableItem, TableLink, TableOp } from '../../table-agent';
import { PDF_PAGES_AT_ONCE, SCREENSHOT_WIDE, pageRange, pdfName, renderSize, screenshotBlock } from '../../table-render';
import { fullScreenshot, ScreenshotError, type ScreenshotEnvironment } from '../screenshot';
import { renderAddress, renderKind } from '../table-render';
import { arenaFile, type SavesDeps } from '../saves';

/** The most sources one call renders: each is a fetch, a capture, or a dozen pages. */
export const RENDER_MAX = 4;

export interface RenderDeps {
	env: ScreenshotEnvironment;
	origin(): string;
	/** One operation on Casey's open table page. */
	run(op: TableOp): Promise<Record<string, unknown>>;
	/** What every change answers with: where the things it touched ended up. */
	report(done: Record<string, unknown>, ids: string[], issues?: unknown): Promise<{ output: { type: 'text'; text: string }[] }>;
	/** The ids Casey had selected when asking. */
	selection(): string[];
	/** The block meant by an id, an address or words from a title. */
	named(blocks: TableItem[], asked: string): TableItem | undefined;
	saves(): SavesDeps;
	/** In place of the network, for tests and replays. */
	fetcher?: typeof fetch;
}

const clip = (value: string, limit: number) => (value.length <= limit ? value : `${value.slice(0, limit).trimEnd()}…`);
const SELECTED = /^(selected|selection|the selection|these|those|this)$/i;
const ARENA_BLOCK = /^https?:\/\/(www\.)?are\.na\/block\/\d+/i;
const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value : []).map((one) => (typeof one === 'string' ? one : (one as { id?: unknown } | null)?.id)).filter((id): id is string => typeof id === 'string');

interface Target { block?: TableItem; address: string; title: string; pdf?: boolean }

export function renderTool(deps: RenderDeps): ToolRegistration {
	/** The address to render for a block or a given address: an Are.na block's own file or saved link, this site's pages in full. */
	const resolve = async (given: string, title: string | undefined): Promise<{ address: string; title?: string; pdf?: boolean } | { error: string }> => {
		let address = given.trim();
		let name = title;
		let pdf: boolean | undefined;
		if (address.startsWith('/')) address = new URL(address, deps.origin()).href;
		if (ARENA_BLOCK.test(address)) {
			const file = await arenaFile(deps.saves(), address).catch(() => null);
			if (file?.file) { address = file.file; pdf = /pdf/i.test(file.type ?? '') || /\.pdf($|\?)/i.test(file.file); if (!pdf) return { error: `That Are.na block is a file of type ${file.type ?? 'unknown'}, which can’t be rendered: only PDFs and web pages can.` }; }
			else if (file?.source) address = file.source;
			name ??= file?.title;
		}
		const safe = renderAddress(address);
		if (!safe) return { error: 'Only public https addresses can be rendered.' };
		return { address: safe, title: name, pdf };
	};

	return {
		name: 'table_render',
		description: 'Render sources as pictures on the table: a PDF becomes its pages (12 a call), a web page one screenshot of the whole page. It finds out which each is, sets the result beside its block and joins them with an arrow.',
		parameters: {
			type: 'object',
			properties: {
				blocks: { type: 'array', maxItems: RENDER_MAX, items: { type: 'string' }, description: 'Blocks on the table: ids, or words from their titles. Leave out, with no urls, for Casey’s selection.' },
				urls: { type: 'array', maxItems: RENDER_MAX, items: { type: 'string' }, description: 'Addresses that aren’t on the table.' },
				pages: { type: 'string', description: `A PDF’s pages, such as "3" or "13-24"; the first ${PDF_PAGES_AT_ONCE} if left out.` },
				refresh: { type: 'boolean', description: 'Retake a screenshot already kept; only if Casey asks.' }
			}
		},
		async execute(args) {
			const input = args as { blocks?: unknown; urls?: unknown; pages?: unknown; refresh?: unknown };
			const strings = (value: unknown) => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter((one): one is string => typeof one === 'string' && !!one.trim()).map((one) => one.trim());
			const table = await deps.run({ op: 'read' }) as { items?: TableItem[]; selected?: string[] };
			const blocks = (table.items ?? []).filter((item) => item.url);
			const asked = strings(input.blocks), urls = strings(input.urls);
			const chosen = deps.selection().length ? deps.selection() : table.selected ?? [];
			const selection = blocks.filter((item) => chosen.includes(item.id));
			const named = asked.filter((one) => !SELECTED.test(one));
			const found = named.map((one) => deps.named(blocks, one));
			// A model often names an address under `blocks`: one that is no block is rendered as an address.
			const loose = named.filter((one, index) => !found[index] && /^(https?:\/\/|\/)/.test(one));
			const missing = named.filter((one, index) => !found[index] && !loose.includes(one));
			const sources = [...found.filter((item): item is TableItem => !!item), ...(named.length < asked.length || (!asked.length && !urls.length) ? selection : [])];
			const targets: (Target | { error: string; title: string })[] = [];
			const wanted: { block?: TableItem; given: string }[] = [...new Map(sources.map((item) => [item.id, item])).values()].map((block) => ({ block, given: block.url! }));
			for (const address of [...loose, ...urls]) {
				const block = deps.named(blocks, address);
				wanted.push(block ? { block, given: block.url! } : { given: address });
			}
			if (!wanted.length) throw new Error(missing.length
				? `No block on the table matches ${missing.map((one) => `“${one}”`).join(', ')}. The blocks are: ${blocks.slice(0, 20).map((item) => `${item.id} “${clip(item.title ?? '', 40)}”`).join(', ') || 'none'}. To render an address that isn’t on the table, give it in \`urls\`.`
				: 'Casey has no blocks selected. Name the blocks (ids or words from their titles), or give `urls`.');
			const left = Math.max(0, wanted.length - RENDER_MAX);
			for (const { block, given } of wanted.slice(0, RENDER_MAX)) {
				const title = block?.title && block.title !== block.url ? block.title : undefined;
				const where = await resolve(given, title);
				if ('error' in where) { targets.push({ error: where.error, title: title ?? given }); continue; }
				targets.push({ block, address: where.address, title: where.title ?? '', pdf: where.pdf });
			}

			const range = pageRange(input.pages);
			const added: string[] = [], rendered: Record<string, unknown>[] = [], links: TableLink[] = [];
			for (const target of targets) {
				if ('error' in target) { rendered.push({ source: clip(target.title, 60), note: target.error }); continue; }
				const { block, address } = target;
				const pdf = target.pdf ?? (await renderKind(address, deps.fetcher)) === 'pdf';
				const about = { ...(block ? { from: block.id } : {}), source: clip(target.title || address, 80) };
				// Beside its block, with room for the arrow (and a frame's edge and name).
				const beside = (framed: boolean) => (block ? { x: block.x + block.w + (framed ? 140 : 100), y: block.y + (framed ? 40 : 0) } : undefined);
				if (pdf) {
					const title = target.title || pdfName(address);
					const result = await deps.run({ op: 'add_pdf_pages', url: address, title, from: range.from, count: range.count, block: block?.id }).catch((error: Error) => ({ error: error.message })) as { added?: { id: string; page: number }[]; pages?: number; note?: string; error?: string; already_on_table?: number };
					const got = result.added ?? [];
					const numbers = got.map((one) => one.page);
					const last = numbers.length ? Math.max(...numbers) : range.from + range.count - 1;
					const more = result.pages && last < result.pages ? { more: `Pages ${last + 1} to ${result.pages} aren’t on the table: tell Casey, and render them only if asked (pages "${last + 1}-${Math.min(result.pages, last + PDF_PAGES_AT_ONCE)}").` } : {};
					rendered.push({ ...about, kind: 'pdf', ...(numbers.length ? { pages: numbers.length === 1 ? String(numbers[0]) : `${Math.min(...numbers)}-${last}` } : {}), ...(result.pages ? { of: result.pages } : {}), ...(result.already_on_table ? { already_on_table: result.already_on_table } : {}), ...more, ...(result.note || result.error ? { note: result.note ?? result.error } : {}) });
					if (!got.length) continue;
					const ids = got.map((one) => one.id);
					added.push(...ids);
					const framed = ids.length > 1;
					await deps.run({ op: 'arrange', layout: 'grid', ids, ordered: true, columns: Math.min(ids.length, 4), ...(beside(framed) ? { at: beside(framed) } : {}) });
					const holder = framed ? idsOf((await deps.run({ op: 'frame', name: clip(`Pages of ${title}`, 100), ids })).added)[0] : ids[0];
					if (holder && block) links.push({ from: block.id, to: holder });
					continue;
				}
				try {
					const shot = await fullScreenshot(deps.env, address, { refresh: input.refresh === true, fetcher: deps.fetcher });
					const result = await deps.run({ op: 'add_blocks', blocks: [screenshotBlock(address, target.title)], sizes: [renderSize({ w: shot.width, h: shot.height }, SCREENSHOT_WIDE)], plain: true, columns: 1, at: beside(false) });
					const id = idsOf(result.added)[0];
					rendered.push({ ...about, kind: 'screenshot', picture: `${shot.width}×${shot.height}px`, ...(shot.cached ? { kept_from_before: true } : {}) });
					if (!id) continue;
					added.push(id);
					if (block) links.push({ from: block.id, to: id });
				} catch (error) {
					if (!(error instanceof ScreenshotError)) console.warn(JSON.stringify({ event: 'chat_render_failed', detail: String((error as Error)?.message ?? error).slice(0, 200) }));
					rendered.push({ ...about, kind: 'screenshot', note: error instanceof ScreenshotError ? error.message : 'That page couldn’t be captured.' });
				}
			}
			const notes = [...(missing.length ? [`No block matches ${missing.map((one) => `“${one}”`).join(', ')}.`] : []), ...(left ? [`${left} more weren’t rendered (${RENDER_MAX} at a time): say so.`] : [])];
			if (!added.length) return { output: [{ type: 'text' as const, text: JSON.stringify({ added: 0, rendered, note: ['Nothing was added: tell Casey why, from `rendered`. Don’t try again with the same sources.', ...notes].join(' ') }) }] };
			let issues = (await deps.run({ op: 'tidy' })).issues;
			if (links.length) issues = (await deps.run({ op: 'connect', links })).issues ?? issues;
			return deps.report({ added: added.length, rendered, note: ['Done: tell Casey what you rendered.', ...notes].join(' ') }, added, issues);
		}
	};
}
