/**
 * One picture for each card on a map, kept on the site. Sources' pictures are the flakiest part
 * of a map (paywalls, hotlink blocks, a third simply missing), so each candidate is fetched once,
 * shrunk to the card's shape and mirrored to R2, and a card without a usable one gets a title
 * tile instead. Tables are public pages, so a photograph of a recognizable person is never used:
 * a model looks at each mirrored picture once, and a picture nobody could check is left out too.
 */
import { addressHash } from '../screenshot';
import { safePublicImageFetch, type PublicFetcher } from '../publishing/public-fetch';
import type { Picture } from './model';
import type { ImagesStage, MapDoc, MapImage } from './types';

/** Twice a card's picture (280 by 140 on the canvas), for sharp screens. */
export const PICTURE = { width: 560, height: 280 };
const SMALLEST = 3000, LARGEST = 600_000;
const LOOK_AT_ONCE = 6;

export const pictureKey = (hash: string) => `renders/map/${hash}.jpg`;
export const picturePath = (hash: string) => `/api/tables/render?picture=${hash}`;
export const PICTURE_HASH = /^[0-9a-f]{16,64}$/;

export interface ImageDeps {
	bucket?: R2Bucket;
	images?: ImagesBinding;
	fetcher?: PublicFetcher;
	/** Answers `n: person` or `n: ok` for each picture, in order. Without it nothing can be checked. */
	look?: (prompt: string, pictures: Picture[]) => Promise<string>;
}

type Verdict = 'ok' | 'person' | 'unknown';
interface Kept { hash: string; people: Verdict; data?: Uint8Array }

const base64 = (bytes: Uint8Array) => {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
};

const LOOK = [
	'For each picture, in order, say whether it is a photograph (or video still) in which a real person’s face is clearly visible, so that someone who knows them could recognize them.',
	'Answer `person` for those. Answer `ok` for everything else: illustrations, cartoons, artworks, logos, charts, screenshots of text or interfaces, objects, buildings, landscapes, crowds seen from afar, people seen from behind.',
	'One line per picture and nothing else, as `number: answer`, for example `1: ok`.'
].join('\n');

/** Fetches one candidate, shrinks it to the card's shape and keeps it; null when it can't be used. */
async function mirror(src: string, deps: ImageDeps): Promise<Kept | null> {
	const hash = (await addressHash(src)).slice(0, 32);
	const key = pictureKey(hash);
	const had = await deps.bucket?.head(key);
	if (had) return { hash, people: (had.customMetadata?.people as Verdict) ?? 'unknown' };
	let bytes: Uint8Array;
	try {
		const response = await (deps.fetcher ?? safePublicImageFetch)(src, { headers: { accept: 'image/jpeg,image/png,image/webp,image/avif;q=0.8,image/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
		if (!response.ok) { await response.body?.cancel(); return null; }
		const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) { await response.body?.cancel(); return null; }
		bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length < SMALLEST) return null;
		if (deps.images) {
			const shrunk = await deps.images.input(new Blob([bytes as BlobPart]).stream()).transform({ width: PICTURE.width, height: PICTURE.height, fit: 'cover' }).output({ format: 'image/jpeg', quality: 78 });
			bytes = new Uint8Array(await shrunk.response().arrayBuffer());
		} else if (type !== 'image/jpeg' || bytes.length > LARGEST) return null;
	} catch { return null; }
	if (!deps.bucket || bytes.length > LARGEST) return null;
	await deps.bucket.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { from: src.slice(0, 500), people: 'unknown' } });
	return { hash, people: 'unknown', data: bytes };
}

/**
 * A picture for every document that draws as a card. `before` is the last run's answer: a document
 * whose candidates haven't changed keeps its picture (or its tile) without another fetch.
 */
export async function pickImages(docs: MapDoc[], deps: ImageDeps, before: ImagesStage['images'] = {}): Promise<ImagesStage> {
	const images: Record<string, MapImage | null> = {};
	const todo: MapDoc[] = [];
	for (const doc of docs) {
		if (doc.block || doc.private) continue;
		const was = before[doc.id];
		if (was !== undefined && (was === null ? !doc.images.length : doc.images.includes(was.from))) images[doc.id] = was; else todo.push(doc);
	}
	// Every candidate of every document, mirrored a few at a time.
	const kept = new Map<string, Kept | null>();
	const wanted = [...new Set(todo.flatMap((doc) => doc.images.slice(0, 3)))];
	let next = 0;
	await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const src = wanted[next++]; if (!src) return; kept.set(src, await mirror(src, deps).catch(() => null)); } }));

	// One look at each picture nobody has looked at yet.
	const unseen = [...kept.values()].filter((one): one is Kept => !!one && one.people === 'unknown');
	let people = 0;
	for (let start = 0; start < unseen.length && deps.look; start += LOOK_AT_ONCE) {
		const batch = unseen.slice(start, start + LOOK_AT_ONCE);
		try {
			const pictures: Picture[] = [];
			for (const one of batch) {
				const data = one.data ?? new Uint8Array(await (await deps.bucket!.get(pictureKey(one.hash)))!.arrayBuffer());
				pictures.push({ mimeType: 'image/jpeg', data: base64(data) });
			}
			const answer = await deps.look(LOOK, pictures);
			const said = new Map([...answer.matchAll(/^\W*(\d+)\W+(person|ok)\b/gim)].map((match) => [Number(match[1]), match[2].toLowerCase() as Verdict]));
			await Promise.all(batch.map(async (one, index) => {
				const verdict = said.get(index + 1);
				if (!verdict) return;
				one.people = verdict;
				const stored = await deps.bucket!.get(pictureKey(one.hash));
				if (stored) await deps.bucket!.put(pictureKey(one.hash), await stored.arrayBuffer(), { httpMetadata: stored.httpMetadata, customMetadata: { ...stored.customMetadata, people: verdict } });
			}));
		} catch { /* unchecked pictures stay out */ }
	}

	let unchecked = 0;
	for (const doc of todo) {
		let chosen: MapImage | null = null, doubt = false;
		for (const src of doc.images.slice(0, 3)) {
			const one = kept.get(src);
			if (!one) continue;
			if (one.people === 'ok') { chosen = { src: picturePath(one.hash), from: src }; break; }
			if (one.people === 'person') people++; else doubt = true;
		}
		if (!chosen && doubt) unchecked++;
		images[doc.id] = chosen;
	}
	const cards = docs.filter((doc) => !doc.block && !doc.private);
	const shown = cards.filter((doc) => images[doc.id]).length;
	return { images, kept: shown, tiles: cards.length - shown, people, unchecked };
}
