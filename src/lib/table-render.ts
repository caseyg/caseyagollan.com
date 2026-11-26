/**
 * Rendering onto a table: a PDF's pages as pictures, and what a whole-page screenshot's block looks
 * like. Shared by the chat's `table_render` tool (server), the table page (browser) and replays.
 *
 * PDFs are drawn on Casey's own table page with pdf.js, because a Worker has no canvas to draw on.
 * The page asks first whether a page's picture is already kept; only pages that aren't are drawn,
 * and the PDF itself is fetched (through `/api/tables/render`, since other sites rarely let a
 * browser read their files) only when something has to be drawn.
 */
import type { Block } from './tables';

/** The largest PDF fetched to draw. */
export const MAX_PDF_BYTES = 50_000_000;
/** The highest page number kept or asked for. */
export const MAX_PDF_PAGE = 2000;
/** The most pages put on a table in one go; the rest are asked for by range. */
export const PDF_PAGES_AT_ONCE = 12;
/** A page's picture is this many pixels on its long side: text stays readable zoomed in. */
export const PAGE_SIDE = 1600;

/** One page drawn: where its picture is served, the picture's size in pixels, and how many pages the PDF has. */
export interface RenderedPage { page: number; src: string; w: number; h: number; pages: number }

/** Where a kept page's picture is served. */
export const pdfPageSrc = (address: string, page: number) => `/api/tables/render?pdf=${encodeURIComponent(address)}&page=${page}`;
/** Where a kept whole-page screenshot is served. */
export const fullScreenshotSrc = (address: string) => `/api/screenshot?url=${encodeURIComponent(address)}&full=1`;

/**
 * Which pages are meant by “3”, “13-24”, “5-” or a number: at most `PDF_PAGES_AT_ONCE` from the
 * first named, the first pages when nothing (or nonsense) is given.
 */
export function pageRange(spec: unknown, most = PDF_PAGES_AT_ONCE): { from: number; count: number } {
	const match = /^\s*(?:pages?\s*)?(\d+)\s*(?:(?:-|–|—|to|\.\.)\s*(\d+)?)?\s*$/i.exec(typeof spec === 'number' ? String(spec) : typeof spec === 'string' ? spec : '');
	const from = match ? Math.min(MAX_PDF_PAGE, Math.max(1, Number(match[1]))) : 1;
	const open = !match || /(-|–|—|to|\.\.)\s*$/i.test(String(spec).trim());
	const to = match?.[2] ? Number(match[2]) : open ? from + most - 1 : from;
	return { from, count: Math.max(1, Math.min(most, to - from + 1)) };
}

/**
 * A rendered picture's block on the table: as wide as a column of reading (wider for a landscape
 * slide), and exactly as tall as its picture, so nothing is cropped. A very long page is capped.
 */
export function renderSize(picture: { w: number; h: number }, wide?: number): { w: number; h: number } {
	const w = wide ?? (picture.w > picture.h * 1.15 ? 480 : 320);
	return { w, h: Math.max(40, Math.min(8000, Math.round((w * picture.h) / Math.max(1, picture.w)))) };
}
/** A whole-page screenshot is set down wider than a PDF page: it is a desktop layout. */
export const SCREENSHOT_WIDE = 480;

/** One page of a PDF as a picture block; it opens the PDF at that page. */
export function pdfPageBlock(address: string, title: string, page: RenderedPage): Block {
	return { kind: 'image', url: `${address.split('#')[0]}#page=${page.page}`, title: `${title}, page ${page.page}`.slice(0, 300), meta: `Page ${page.page} of ${page.pages}`, image: page.src };
}

/** A whole page's screenshot as a picture block; it opens the page. */
export function screenshotBlock(address: string, title: string, src = fullScreenshotSrc(address)): Block {
	let host = '';
	try { host = new URL(address).host.replace(/^www\./, ''); } catch { /* a site path */ }
	return { kind: 'image', url: address, title: `Screenshot of ${title || host || address}`.slice(0, 300), meta: host ? `Whole page · ${host}` : 'Whole page', image: src };
}

/** A name for a PDF when nothing better is known: its file name, without the ending. */
export function pdfName(address: string): string {
	try {
		const url = new URL(address);
		const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
		return last || url.host;
	} catch {
		return 'PDF';
	}
}

/** How the table page keeps and finds pictures: the site's bucket for Casey, the page itself in the demo. */
export interface PdfStore {
	/** A page's picture if it is already kept. */
	kept(page: number): Promise<RenderedPage | null>;
	/** Keeps a page's picture; answers where it is served. */
	keep(page: number, picture: Blob, size: { w: number; h: number; pages: number }): Promise<string>;
	/** The long side to draw at, when not `PAGE_SIDE`. */
	side?: number;
}

/** pdf.js, as little of it as is used here; tests pass their own. */
export interface PdfReader {
	open(address: string): Promise<{ pages: number; draw(page: number, side: number): Promise<{ picture: Blob; w: number; h: number }>; close(): void }>;
}

/** Whether a page was told to stop: the chat gave up waiting. */
export class RenderCancelled extends Error {}

/**
 * The pictures of `count` pages from page `from`, kept ones reused and the rest drawn and kept.
 * `pages` is how many the PDF has; `drawn` how many had to be drawn now.
 */
export async function pdfPages(address: string, range: { from: number; count: number }, store: PdfStore, reader: PdfReader = pdfjsReader, cancelled: () => boolean = () => false): Promise<{ pages: RenderedPage[]; total: number; drawn: number }> {
	const first = await store.kept(range.from).catch(() => null);
	// A kept page knows how long its PDF is, so the rest can be looked for without opening it.
	if (first) {
		const last = Math.min(first.pages, range.from + range.count - 1);
		const rest = await Promise.all(Array.from({ length: last - range.from }, (_, index) => store.kept(range.from + index + 1).catch(() => null)));
		if (rest.every((page) => page)) return { pages: [first, ...(rest as RenderedPage[])], total: first.pages, drawn: 0 };
	}
	const pdf = await reader.open(address);
	try {
		if (range.from > pdf.pages) return { pages: [], total: pdf.pages, drawn: 0 };
		const last = Math.min(pdf.pages, range.from + range.count - 1);
		const pages: RenderedPage[] = [];
		let drawn = 0;
		for (let page = range.from; page <= last; page++) {
			if (cancelled()) throw new RenderCancelled('Stopped.');
			const kept = page === range.from ? first : await store.kept(page).catch(() => null);
			if (kept) { pages.push(kept); continue; }
			const { picture, w, h } = await pdf.draw(page, store.side ?? PAGE_SIDE);
			pages.push({ page, src: await store.keep(page, picture, { w, h, pages: pdf.pages }), w, h, pages: pdf.pages });
			drawn++;
		}
		return { pages, total: pdf.pages, drawn };
	} finally {
		pdf.close();
	}
}

/** Where the table page gets a PDF's bytes. */
export const pdfSource = (address: string) => `/api/tables/render?pdf=${encodeURIComponent(address)}`;

/** pdf.js itself, loaded only when a PDF is to be drawn. */
export const pdfjsReader: PdfReader = {
	async open(address) {
		const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
		pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
		// The whole file in one request: the site's own route hands it over, and doesn't serve ranges.
		const task = pdfjs.getDocument({ url: pdfSource(address), withCredentials: true, disableRange: true, disableAutoFetch: true });
		let document: Awaited<typeof task.promise>;
		try { document = await task.promise; } catch (error) {
			const status = (error as { status?: number }).status;
			throw new Error((error as Error)?.name === 'PasswordException' ? 'That PDF is locked with a password.' : status === 403 ? 'Only Casey, signed in, can render a PDF here.' : (error as Error)?.name === 'InvalidPDFException' ? 'That address didn’t send a PDF.' : 'That PDF couldn’t be opened (it may be too large, or its site refused).');
		}
		return {
			pages: document.numPages,
			async draw(number, side) {
				const page = await document.getPage(number);
				const plain = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: side / Math.max(plain.width, plain.height) });
				const canvas = window.document.createElement('canvas');
				canvas.width = Math.round(viewport.width);
				canvas.height = Math.round(viewport.height);
				await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
				page.cleanup();
				const blob = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => (made ? resolve(made) : reject(new Error('That page couldn’t be drawn.'))), 'image/jpeg', quality));
				let picture = await blob(0.85);
				// A page that is all photograph: lighter, rather than too large to keep.
				if (picture.size > 1_800_000) picture = await blob(0.6);
				const size = { w: canvas.width, h: canvas.height };
				canvas.width = canvas.height = 0;
				return { picture, ...size };
			},
			close: () => void task.destroy()
		};
	}
};
