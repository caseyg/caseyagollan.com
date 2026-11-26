import { describe, expect, test } from 'bun:test';
import { pageRange, pdfName, pdfPageBlock, pdfPages, renderSize, screenshotBlock, type PdfReader, type PdfStore, type RenderedPage } from '../src/lib/table-render';
import { keepPdfPage, keptPdfPage, pageNumber, renderAddress, renderKind } from '../src/lib/server/table-render';
import { jpegSize } from '../src/lib/server/screenshot';
import { tableOpTimeout } from '../src/lib/server/chat/canvas';

const jpeg = (width: number, height: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);

describe('rendering onto a table', () => {
	test('page ranges: one page, a span, an open end, and never more than twelve at once', () => {
		expect(pageRange(undefined)).toEqual({ from: 1, count: 12 });
		expect(pageRange('3')).toEqual({ from: 3, count: 1 });
		expect(pageRange(7)).toEqual({ from: 7, count: 1 });
		expect(pageRange('13-24')).toEqual({ from: 13, count: 12 });
		expect(pageRange('pages 2 to 4')).toEqual({ from: 2, count: 3 });
		expect(pageRange('5-')).toEqual({ from: 5, count: 12 });
		expect(pageRange('1-400')).toEqual({ from: 1, count: 12 });
		expect(pageRange('all of them')).toEqual({ from: 1, count: 12 });
	});

	test('a rendered picture’s block is exactly as tall as its picture', () => {
		expect(renderSize({ w: 1236, h: 1600 })).toEqual({ w: 320, h: 414 });
		// A landscape slide is set down wider.
		expect(renderSize({ w: 1600, h: 900 })).toEqual({ w: 480, h: 270 });
		expect(renderSize({ w: 1280, h: 5400 }, 480)).toEqual({ w: 480, h: 2025 });
		// An endless page is capped.
		expect(renderSize({ w: 1280, h: 90000 }, 480).h).toBe(8000);
	});

	test('blocks: a page opens the PDF at that page; a screenshot opens its page', () => {
		const page: RenderedPage = { page: 3, src: '/api/tables/render?pdf=x&page=3', w: 1236, h: 1600, pages: 15 };
		expect(pdfPageBlock('https://example.com/a.pdf#page=9', 'A paper', page)).toEqual({ kind: 'image', url: 'https://example.com/a.pdf#page=3', title: 'A paper, page 3', meta: 'Page 3 of 15', image: page.src });
		expect(screenshotBlock('https://www.indieweb.org/Micropub', '')).toMatchObject({ kind: 'image', title: 'Screenshot of indieweb.org', meta: 'Whole page · indieweb.org', image: '/api/screenshot?url=https%3A%2F%2Fwww.indieweb.org%2FMicropub&full=1' });
		expect(pdfName('https://example.com/files/calm_tech-notes.pdf?x=1')).toBe('calm tech notes');
	});

	const reader = (pages: number, opened: string[], drew: number[]): PdfReader => ({
		open: async (address) => { opened.push(address); return { pages, draw: async (page) => { drew.push(page); return { picture: new Blob([jpeg(1236, 1600)]), w: 1236, h: 1600 }; }, close() {} }; }
	});
	const memory = (): PdfStore & { held: Map<number, RenderedPage> } => {
		const held = new Map<number, RenderedPage>();
		return { held, kept: async (page) => held.get(page) ?? null, keep: async (page, _picture, size) => { held.set(page, { page, src: `kept/${page}`, ...size }); return `kept/${page}`; } };
	};

	test('pages are drawn once: kept ones are reused, and the PDF isn’t opened when all are kept', async () => {
		const store = memory(), opened: string[] = [], drew: number[] = [];
		const first = await pdfPages('https://example.com/a.pdf', { from: 1, count: 12 }, store, reader(5, opened, drew));
		expect(first).toMatchObject({ total: 5, drawn: 5 });
		expect(first.pages.map((page) => page.page)).toEqual([1, 2, 3, 4, 5]);
		const again = await pdfPages('https://example.com/a.pdf', { from: 1, count: 12 }, store, reader(5, opened, drew));
		expect(again).toMatchObject({ total: 5, drawn: 0 });
		expect(opened).toHaveLength(1);
		// One page missing: only that one is drawn.
		store.held.delete(4);
		drew.length = 0;
		expect((await pdfPages('https://example.com/a.pdf', { from: 3, count: 3 }, store, reader(5, opened, drew))).drawn).toBe(1);
		expect(drew).toEqual([4]);
		// Past the end: nothing, but the length is known.
		expect(await pdfPages('https://example.com/a.pdf', { from: 9, count: 12 }, memory(), reader(5, opened, drew))).toEqual({ pages: [], total: 5, drawn: 0 });
	});

	test('only public https addresses, and only real page numbers', () => {
		expect(renderAddress('https://arxiv.org/pdf/1706.03762')).toBe('https://arxiv.org/pdf/1706.03762');
		for (const address of ['http://arxiv.org/a.pdf', 'https://localhost/a.pdf', 'https://127.0.0.1/a.pdf', 'https://printer.local/a.pdf', 'https://user:pw@example.com/a.pdf', 'https://example.com:8443/a.pdf', 'file:///etc/passwd', '/a.pdf', 7]) expect(renderAddress(address)).toBeNull();
		expect(pageNumber('3')).toBe(3);
		for (const page of ['0', '-1', '2.5', 'x', '99999']) expect(pageNumber(page)).toBeNull();
	});

	test('a kept page is a JPEG with its size; anything else is refused', async () => {
		const objects = new Map<string, { size: number; customMetadata?: Record<string, string> }>();
		const bucket = { head: async (key: string) => objects.get(key) ?? null, put: async (key: string, body: ArrayBuffer, options: { customMetadata?: Record<string, string> }) => { objects.set(key, { size: body.byteLength, customMetadata: options.customMetadata }); } } as unknown as R2Bucket;
		const address = 'https://example.com/a.pdf';
		expect(await keptPdfPage(bucket, address, 2)).toBeNull();
		const kept = await keepPdfPage(bucket, address, 2, jpeg(1236, 1600).buffer as ArrayBuffer, { w: 1236, h: 1600, pages: 15 });
		expect(kept).toEqual({ page: 2, src: '/api/tables/render?pdf=https%3A%2F%2Fexample.com%2Fa.pdf&page=2', w: 1236, h: 1600, pages: 15 });
		expect(await keptPdfPage(bucket, address, 2)).toEqual(kept);
		expect([...objects.keys()][0]).toMatch(/^renders\/pdf\/[0-9a-f]{32}\/2\.jpg$/);
		expect(keepPdfPage(bucket, address, 3, new TextEncoder().encode('<html>').buffer as ArrayBuffer, { w: 1, h: 1, pages: 15 })).rejects.toThrow('must be a JPEG');
		expect(keepPdfPage(bucket, address, 3, new Uint8Array(2_000_001).buffer, { w: 1, h: 1, pages: 15 })).rejects.toThrow('too large');
	});

	test('an address is a PDF by its name, or by what it sends', async () => {
		const dns = Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
		const sends = (type: string) => (async (input: RequestInfo | URL) => String(input).startsWith('https://cloudflare-dns.com/') ? dns.clone() : new Response('x', { headers: { 'content-type': type, 'content-length': '1' } })) as typeof fetch;
		const never = (async () => { throw new Error('not asked'); }) as unknown as typeof fetch;
		expect(await renderKind('https://example.com/files/Paper.PDF?download=1', never)).toBe('pdf');
		expect(await renderKind('https://arxiv.org/pdf/1706.03762', sends('application/pdf'))).toBe('pdf');
		expect(await renderKind('https://indieweb.org/Micropub', sends('text/html; charset=utf-8'))).toBe('page');
		// Unreachable or unclear: a page, which the screenshot then reports on.
		expect(await renderKind('https://example.com/thing', never)).toBe('page');
	});

	test('a JPEG’s size is read from its frame header', () => {
		expect(jpegSize(jpeg(1280, 5400))).toEqual({ width: 1280, height: 5400 });
		expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
		expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
	});

	test('drawing a PDF’s pages gets longer to answer than other changes', () => {
		expect(tableOpTimeout('add_pdf_pages', false)).toBe(90_000);
		expect(tableOpTimeout('arrange', false)).toBe(30_000);
		expect(tableOpTimeout('add_pdf_pages', true)).toBe(12_000);
	});
});
