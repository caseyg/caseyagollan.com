import type { BookMetadata } from '../src/lib/library-metadata';
import { bookTags, uniqueLabels } from './search-filters';

export const OPEN_LIBRARY_HEADERS = {
	'User-Agent': 'caseyagollan.com (caseygollan@gmail.com)',
	From: 'caseygollan@gmail.com',
	Accept: 'application/json'
};
const retryMissingAfter = 30 * 24 * 60 * 60 * 1000;
export interface CatalogBook {
	public?: string;
	originalisbn?: string;
	genre?: unknown[];
	ddc?: { wording?: unknown[] } | unknown[];
}
interface OpenLibraryRecord {
	key?: string;
	description?: string | { value?: string };
	subjects?: string[];
	works?: { key: string }[];
}
type JsonFetcher = (path: string) => Promise<any>;
const description = (record?: OpenLibraryRecord) => {
	const value = record?.description;
	return (typeof value === 'string' ? value : value?.value)?.trim() || undefined;
};

/** Batch requests, preserve successful enrichment forever, and retry genuine misses monthly. */
export async function enrichLibraryMetadata(
	catalog: Record<string, CatalogBook>, saved: Record<string, BookMetadata>,
	fetchJson?: JsonFetcher, now = new Date(), checkpoint: () => Promise<void> = async () => {}
) {
	const pending: [string, string][] = [];
	for (const [id, book] of Object.entries(catalog)) {
		if (book.public === 'false') continue;
		const entry = saved[id] ??= {};
		entry.categories = uniqueLabels([...(entry.categories ?? []), ...bookTags({ genre: book.genre, ddc: Array.isArray(book.ddc) ? undefined : book.ddc })]);
		const checked = Date.parse(entry.openLibraryCheckedAt ?? '');
		if (fetchJson && !entry.description?.trim() && !(now.getTime() - checked < retryMissingAfter) && book.originalisbn) {
			pending.push([id, book.originalisbn.replace(/[-\s]/g, '')]);
		}
	}
	await checkpoint();
	// Work records are often shared by multiple editions in the catalog.
	const works = new Map<string, OpenLibraryRecord | undefined>();
	for (let start = 0; start < pending.length; start += 20) {
		const batch = pending.slice(start, start + 20);
		const bibkeys = [...new Set(batch.map(([, isbn]) => `ISBN:${isbn}`))];
		const editions = await fetchJson!(`/api/books?${new URLSearchParams({ bibkeys: bibkeys.join(','), format: 'json', jscmd: 'details' })}`) as Record<string, { details?: OpenLibraryRecord; info_url?: string }>;
		if (!editions || typeof editions !== 'object' || Array.isArray(editions)) throw new Error('Invalid Open Library edition response');
		const keys = uniqueLabels(batch.flatMap(([, isbn]) => editions[`ISBN:${isbn}`]?.details?.works?.map(work => work.key) ?? []))
			.filter(key => /^\/works\/OL\d+W$/.test(key) && !works.has(key));
		if (keys.length) {
			const response = await fetchJson!(`/api/get_many?${new URLSearchParams({ keys: JSON.stringify(keys) })}`);
			if (response?.status !== 'ok' || !response.result) throw new Error('Invalid Open Library work response');
			for (const key of keys) works.set(key, response.result[key] ?? undefined);
		}
		for (const [id, isbn] of batch) {
			const edition = editions[`ISBN:${isbn}`]?.details;
			const related = (edition?.works ?? []).map(work => works.get(work.key)).filter((work): work is OpenLibraryRecord => !!work);
			const text = description(edition) ?? related.map(description).find(Boolean);
			const entry = saved[id];
			if (text) entry.description = text;
			entry.categories = uniqueLabels([...(entry.categories ?? []), ...(edition?.subjects ?? []), ...related.flatMap(work => work.subjects ?? [])]);
			const source = edition?.key ?? related[0]?.key;
			if (source && /^\/(books|works)\/OL\d+[MW]$/.test(source)) entry.sourceUrl = `https://openlibrary.org${source}`;
			entry.openLibraryCheckedAt = now.toISOString();
		}
		await checkpoint();
		console.log(`Open Library: checked ${Math.min(start + batch.length, pending.length)}/${pending.length} uncached books`);
	}
}

/** Conservative 2 requests/second; all requests carry the site/contact identity. */
export function openLibraryClient(fetcher: typeof fetch = fetch): JsonFetcher {
	let nextRequest = 0;
	return async (path) => {
		const delay = Math.max(0, nextRequest - Date.now());
		if (delay) await new Promise(resolve => setTimeout(resolve, delay));
		nextRequest = Date.now() + 500;
		const response = await fetcher(`https://openlibrary.org${path}`, {
			headers: OPEN_LIBRARY_HEADERS, signal: AbortSignal.timeout(30_000)
		});
		if (!response.ok) throw new Error(`Open Library HTTP ${response.status}${response.headers.get('Retry-After') ? `; Retry-After: ${response.headers.get('Retry-After')}` : ''}. Stopping; saved metadata is preserved.`);
		return response.json();
	};
}
