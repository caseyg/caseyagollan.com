/**
 * Casey's private Are.na blocks and channels, searched for the signed-in owner only. They never go in
 * the public search index; the Worker reads them with the `ARENA_PAT` secret and keeps a copy in the
 * `PUBLISHING_STATE` bucket, which only the Worker can read, so a search doesn't page through Are.na.
 */
import { arenaDocument, fetchArena, isOwn, isVisible, type ArenaDocument } from '$lib/arena';
import { ARENA_ICON, type Block } from '$lib/tables';

const KEY = 'arena/private.json';
/** How long a copy is fresh; an older one still answers while a new one is fetched. */
const FRESH_MS = 10 * 60 * 1000;
const LIMIT = 24;

interface Snapshot {
	fetched: number;
	documents: ArenaDocument[];
}

export interface ArenaEnv {
	ARENA_PAT?: string;
	PUBLISHING_STATE?: R2Bucket;
}

/** Fetches Casey's items with the token and keeps the ones only Casey can see. */
export async function fetchPrivateArena(token: string, fetcher?: typeof fetch): Promise<Snapshot> {
	const items = await fetchArena({ token, fetcher });
	return { fetched: Date.now(), documents: items.filter((item) => isOwn(item) && !isVisible(item)).map(arenaDocument) };
}

async function readSnapshot(bucket: R2Bucket | undefined): Promise<Snapshot | null> {
	const object = await bucket?.get(KEY).catch(() => null);
	return object ? ((await object.json().catch(() => null)) as Snapshot | null) : null;
}

/**
 * The private items, from the bucket when the copy is fresh. A stale copy answers at once and is
 * refreshed in the background (`waitUntil`); with no copy, this waits for Are.na.
 */
export async function privateArena(env: ArenaEnv, waitUntil?: (promise: Promise<unknown>) => void, fetcher?: typeof fetch): Promise<ArenaDocument[]> {
	const token = env.ARENA_PAT;
	if (!token) return [];
	const cached = await readSnapshot(env.PUBLISHING_STATE);
	if (cached && Date.now() - cached.fetched < FRESH_MS) return cached.documents;
	const refresh = fetchPrivateArena(token, fetcher).then(async (snapshot) => {
		await env.PUBLISHING_STATE?.put(KEY, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });
		return snapshot.documents;
	});
	if (cached && waitUntil) {
		waitUntil(refresh.catch((error) => console.warn('Are.na refresh failed', error)));
		return cached.documents;
	}
	return refresh.catch((error) => {
		if (cached) return cached.documents;
		throw error;
	});
}

/** Every word of the query in the title or text; title matches first. An empty query lists them all, newest first. */
export function searchArena(documents: ArenaDocument[], query: string, limit = LIMIT): ArenaDocument[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const newest = [...documents].sort((a, b) => b.date.localeCompare(a.date));
	if (!words.length) return newest.slice(0, limit);
	const scored = newest
		.map((document) => {
			const title = document.title.toLowerCase();
			const all = `${title} ${document.text.toLowerCase()}`;
			if (!words.every((word) => all.includes(word))) return null;
			return { document, score: words.filter((word) => title.includes(word)).length };
		})
		.filter((entry) => entry !== null);
	return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.document);
}

/** A private item as a table block: marked private, since tables are public. */
export function privateBlock(document: ArenaDocument): Block {
	const excerpt = document.text.replace(/\s+/g, ' ').trim().slice(0, 300) || undefined;
	return { kind: 'arena', url: document.url, title: document.title, meta: `Private · ${document.detail}`, excerpt, image: document.image, icon: ARENA_ICON[document.kind] };
}
