import type { BookMetadata } from '../src/lib/library-metadata';
import type { CatalogBook } from './openlibrary-metadata';

export async function discoverLibraryCovers(catalog: Record<string, CatalogBook>, saved: Record<string, BookMetadata>, fetchJson: (path: string) => Promise<any>, checkpoint: () => Promise<void>) {
	const pending = Object.entries(catalog).filter(([id, book]) => book.public !== 'false' && book.originalisbn && !saved[id]?.coverId && !(Date.now() - Date.parse(saved[id]?.coverCheckedAt ?? '') < 30 * 86400000));
	for (let start = 0; start < pending.length; start += 20) {
		const batch = pending.slice(start, start + 20);
		const editions = await fetchJson(`/api/books?${new URLSearchParams({bibkeys: batch.map(([,book]) => `ISBN:${book.originalisbn}`).join(','), format:'json', jscmd:'details'})}`);
		const keys = [...new Set<string>(batch.flatMap(([, book]) => (editions[`ISBN:${book.originalisbn}`]?.details?.works ?? []).map((work: {key:string}) => work.key)))].filter(key => /^\/works\/OL\d+W$/.test(key));
		const works = keys.length ? await fetchJson(`/api/get_many?${new URLSearchParams({keys: JSON.stringify(keys)})}`) : {status:'ok', result:{}};
		if (works.status !== 'ok' || !works.result) throw new Error('Invalid Open Library work response');
		for (const [id, book] of batch) {
			const edition = editions[`ISBN:${book.originalisbn}`]?.details;
			const ids = [...(edition?.covers ?? []), ...(edition?.works ?? []).flatMap((work: {key:string}) => works.result[work.key]?.covers ?? [])];
			const coverId = ids.find(id => Number.isSafeInteger(id) && id > 0);
			const entry = saved[id] ??= {};
			if (coverId) entry.coverId = coverId;
			entry.coverCheckedAt = new Date().toISOString();
		}
		await checkpoint();
		console.log(`Cover discovery: ${Math.min(start + batch.length, pending.length)}/${pending.length}`);
	}
}

/** Covers API serves JPEGs. Reject malformed files and tiny placeholder images. */
export function jpegDimensions(bytes: Uint8Array): {width:number; height:number} | null {
	if (bytes[0] !== 255 || bytes[1] !== 216) return null;
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset++] !== 255) return null;
		while (bytes[offset] === 255) offset++;
		const marker = bytes[offset++];
		if (marker === 217 || marker === 218) return null;
		if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
		const length = (bytes[offset] << 8) | bytes[offset+1];
		if (length < 2 || offset + length > bytes.length) return null;
		if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
			if (length < 8) return null;
			return {height:(bytes[offset+3]<<8)|bytes[offset+4], width:(bytes[offset+5]<<8)|bytes[offset+6]};
		}
		offset += length;
	}
	return null;
}
