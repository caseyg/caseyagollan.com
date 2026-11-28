/**
 * Likeness between saved things, pictures included. Each document's words, and its picture when it
 * has one, are embedded with a multimodal model on Workers AI (`@cf/google/embeddinggemma-2`, which
 * puts text and images in one space and keeps nothing it is sent), so words find pictures and a
 * picture finds pictures like it. The vectors live in the index's own database, beside the
 * documents, and are compared there: no other service holds them.
 *
 * The words in a picture are read too (`imageWords`), by a vision model on Workers AI that also
 * keeps nothing, and kept in the index by the picture's address: read once, then searched and
 * compared like any other words.
 *
 * Without the `AI` binding none of this runs, and the rest of the cache works as before.
 */
import { viewImage } from '../chat/view-image';
import { LIKE_SEEDS_MAX, type LikeSeed } from '../../table-feed';
import type { SourceHit, SourceIndex } from './index';

export const EMBED_MODEL = '@cf/google/embeddinggemma-2';
/** Shorter vectors than the model's 768: a third of the storage for a small cost in quality. */
export const EMBED_DIMENSIONS = 256;
const TEXT_BATCH = 16;
const IMAGE_BATCH = 2;
/** Characters of a document that are embedded: its title, summary, highlights and opening. */
const TEXT_CHARS = 6000;

type Content = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
interface EmbedInput { input?: string[]; messages?: { role: 'user'; content: Content }[][]; dimensions: number }
export interface EmbedEnv {
	AI?: { run(model: string, input: never): Promise<unknown> };
	IMAGES?: ImagesBinding;
	/** Another vision model to read pictures with, in place of `READ_MODEL`. */
	SOURCES_READ_MODEL?: string;
	/** How a picture is fetched, as a `data:` address; tests give their own. */
	see?: (url: string) => Promise<string>;
}

/** Reads the words in a picture: small, made for it, and keeps nothing it is sent. */
export const READ_MODEL = '@cf/moondream/moondream3.1-9B-A2B';
const READ_PROMPT = 'Transcribe all the text that can be read in this image, exactly as written, in reading order. Reply with the text alone. If the image has no readable text, reply with the single word NONE.';
/** Pictures read for the first time in one question: each is a call to the model. */
const READ_AT_ONCE = 4;
/** Fewer words than this in a picture say too little to find anything by. */
const READ_WORTH = 12;

async function run(env: EmbedEnv, input: Omit<EmbedInput, 'dimensions'>): Promise<number[][]> {
	const answer = (await env.AI!.run(EMBED_MODEL, { ...input, dimensions: EMBED_DIMENSIONS } as never)) as { data?: { index?: number; embedding?: number[] }[] };
	const data = [...(answer.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((entry) => entry.embedding ?? []);
	if (!data.length || data.some((vector) => !vector.length)) throw new Error('The embedding model sent no vectors.');
	return data;
}

/** The model's own way of marking what is a document and what is a question. */
export const asDocument = (title: string, text: string) => `title: ${title.replace(/\s+/g, ' ').trim() || 'none'} | text: ${text}`;
export const asQuery = (words: string) => `task: search result | query: ${words}`;

async function picture(env: EmbedEnv, url: string): Promise<string> {
	if (env.see) return env.see(url);
	const image = await viewImage(url, { origin: 'https://caseyagollan.com/', images: env.IMAGES });
	return `data:${image.mimeType};base64,${image.data}`;
}

/** What the model said, as the words alone: no fence or quotes around them, and nothing at all when it found none. */
export function readWords(said: string): string {
	const words = said.replace(/^```\w*\n?|```$/g, '').trim().replace(/^["“]([\s\S]*)["”]$/, '$1').trim();
	return /^(none|(there is )?no (readable |visible )?text( (is|was|can be) (found|visible|present|read))?( in (this|the) (image|picture))?)[.!]?$/i.test(words) ? '' : words;
}

/** What reading has cost so far, as the model counts it; kept in the index's state under `READ_USAGE`. */
export interface ReadUsage { pictures: number; input: number; output: number }
export const READ_USAGE = 'read:usage';
/** Workers AI's prices for `READ_MODEL`, dollars per million tokens. */
export const READ_PRICE = { input: 0.3, output: 1 };

const tokens = (from: unknown, ...names: string[]) => { for (const name of names) { const value = (from as Record<string, unknown> | undefined)?.[name]; if (typeof value === 'number') return value; } return 0; };

async function read(env: EmbedEnv, data: string, index?: SourceIndex): Promise<string> {
	const answer = (await env.AI!.run(env.SOURCES_READ_MODEL || READ_MODEL, { task: 'query', image: data, question: READ_PROMPT, reasoning: false, temperature: 0, max_tokens: 1500 } as never)) as { answer?: string | null; response?: string | null; metrics?: unknown; usage?: unknown } | string;
	const said = typeof answer === 'string' ? answer : answer?.answer ?? answer?.response;
	if (typeof said !== 'string') throw new Error('The vision model sent no answer.');
	if (index && typeof answer !== 'string') {
		// However the model names its counts; none at all still counts the picture.
		const counts = answer.usage ?? answer.metrics, had = index.state<ReadUsage>(READ_USAGE) ?? { pictures: 0, input: 0, output: 0 };
		index.setState(READ_USAGE, { pictures: had.pictures + 1, input: had.input + tokens(counts, 'input_tokens', 'prompt_tokens'), output: had.output + tokens(counts, 'output_tokens', 'completion_tokens') });
	}
	return readWords(said);
}

/**
 * The words in a picture, read once and kept by its address (empty when it has none). A picture
 * that can't be fetched or read throws and nothing is kept, so it is tried again another time.
 * `fresh: false` answers only from what was kept.
 */
export async function imageWords(index: SourceIndex, env: EmbedEnv, url: string, { fresh = true, data }: { fresh?: boolean; data?: string } = {}): Promise<string | undefined> {
	const kept = index.imageText(url);
	if (kept !== undefined || !fresh || !env.AI) return kept;
	// The model fetches a public picture itself, which costs no shrinking; one it can't reach is fetched and shrunk here.
	const direct = !data && !env.see && /^https:\/\//.test(url);
	const words = direct ? await read(env, url, index).catch(async () => read(env, await picture(env, url), index)) : await read(env, data ?? (await picture(env, url)), index);
	index.setImageText(url, words, env.SOURCES_READ_MODEL || READ_MODEL);
	return words;
}

/** Pictures read at once in a pass over them all: the model fetches each itself, so little of it passes through here. */
export const READ_BATCH = 10;

/**
 * Reads the words in up to `count` pictures no one has tried yet, several at once. One that can't
 * be read is marked, so the pass doesn't come back to it. `left` says there are more.
 */
export async function readPending(index: SourceIndex, env: EmbedEnv, count: number): Promise<{ read: number; failed: number; left: boolean }> {
	if (!env.AI || count < 1) return { read: 0, failed: 0, left: false };
	const pictures = index.unreadPictures(Math.min(count, READ_BATCH));
	const done = await Promise.all(pictures.map((url) => imageWords(index, env, url).then(() => true, () => { index.failImageText(url); return false; })));
	const read = done.filter(Boolean).length;
	return { read, failed: done.length - read, left: pictures.length > 0 && index.unreadPictures(1).length > 0 };
}

/** Embeds a batch of what has no vector yet. `left` says there is more to do. */
export async function embedPending(index: SourceIndex, env: EmbedEnv): Promise<{ text: number; images: number; left: boolean }> {
	if (!env.AI) return { text: 0, images: 0, left: false };
	const stamp = new Date().toISOString();
	const documents = index.unembedded('text', TEXT_BATCH);
	if (documents.length) {
		const inputs = documents.map((document) => asDocument(document.title, [document.summary, document.highlights, document.seen, document.text].filter(Boolean).join('\n\n').slice(0, TEXT_CHARS)));
		const vectors = await run(env, { input: inputs });
		documents.forEach((document, at) => { if (vectors[at]) index.saveVector(document.key, 'text', vectors[at]); });
		index.embedded('text', documents.map((document) => document.key), stamp);
	}
	const pictured = index.unembedded('image', IMAGE_BATCH);
	let images = 0;
	// One at a time: a picture that can't be fetched or read is marked and not tried again.
	for (const document of pictured) {
		// Marked before it is tried, like a thin link's page: a picture that takes the Worker down is not tried again.
		index.embedded('image', [document.key], 'failed');
		try {
			const data = await picture(env, document.image!);
			const [vector] = await run(env, { messages: [[{ role: 'user', content: [{ type: 'image_url', image_url: { url: data } }] }]] });
			index.saveVector(document.key, 'image', vector);
			index.embedded('image', [document.key], stamp);
			images++;
			// While the picture is in hand its words are read too, so it is found by them. A picture that can't be read still has its vector.
			await imageWords(index, env, document.image!, { data }).catch(() => undefined);
		} catch {
			index.embedded('image', [document.key], 'failed');
		}
	}
	return { text: documents.length, images, left: documents.length === TEXT_BATCH || pictured.length === IMAGE_BATCH };
}

/** Characters of a question that are embedded: enough for a long sticky. */
export const QUERY_CHARS = 2000;

export interface SimilarOptions {
	/** True only for the signed-in owner. */
	owner: boolean;
	/** A document already here, by key or address: what is like it. */
	like?: string;
	/** Words: what is about them, whether or not it uses them. */
	query?: string;
	/** A picture's address: what looks like it. */
	image?: string;
	/** Compare against pictures only, or words only; both when absent. */
	what?: 'text' | 'image';
	source?: string;
	limit?: number;
}

/** Nearest documents, with privacy applied by the index when the keys are turned back into documents. */
export async function similar(index: SourceIndex, env: EmbedEnv, options: SimilarOptions): Promise<(SourceHit & { score: number })[]> {
	const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
	let vector: ArrayLike<number> | undefined, not: string | undefined;
	if (options.like) {
		const document = index.get(options.like, { owner: options.owner, limit: 1 });
		if (!document) return [];
		not = document.key;
		vector = (options.what === 'image' ? index.vectorOf(document.key, 'image') : undefined) ?? index.vectorOf(document.key, 'text') ?? index.vectorOf(document.key, 'image');
	} else if (env.AI && options.image) {
		[vector] = await run(env, { messages: [[{ role: 'user', content: [{ type: 'image_url', image_url: { url: await picture(env, options.image) } }] }]] });
	} else if (env.AI && options.query?.trim()) {
		[vector] = await run(env, { input: [asQuery(options.query.trim().slice(0, QUERY_CHARS))] });
	}
	if (!vector) return [];
	// More than asked for, since some may be private to this reader or from another source.
	const near = index.nearest(vector, { what: options.what, not, limit: limit * 4 });
	const scores = new Map(near.map((entry) => [entry.key, entry.score]));
	return index.byKeys(near.map((entry) => entry.key), options.owner)
		.filter((hit) => !options.source || hit.source === options.source)
		.slice(0, limit)
		.map((hit) => ({ ...hit, score: Math.round((scores.get(hit.key) ?? 0) * 1000) / 1000 }));
}

export interface AlikeOptions { owner: boolean; seeds: LikeSeed[]; limit?: number }

/**
 * What is like several things at once. Each thing is asked about in the way that suits it (a
 * picture by how it looks and by the words read in it, a saved document by its own vector,
 * anything else by its words), and the answers are put together by rank, so what is near several
 * of them comes first. The things themselves are left out.
 */
export async function alike(index: SourceIndex, env: EmbedEnv, options: AlikeOptions): Promise<(SourceHit & { score: number })[]> {
	const limit = Math.min(Math.max(options.limit ?? 24, 1), 50);
	const seeds = options.seeds.filter((seed) => seed.url || seed.words?.trim() || seed.picture).slice(0, LIKE_SEEDS_MAX);
	const { owner } = options;
	const ask = (asked: Omit<SimilarOptions, 'owner' | 'limit'>) => similar(index, env, { ...asked, owner, limit }).catch(() => []);
	let reads = 0;
	const lists = (await Promise.all(seeds.map(async (seed) => {
		const found: SourceHit[][] = [];
		if (seed.picture) {
			let looks = seed.url ? await ask({ like: seed.url, what: 'image' }) : [];
			if (!looks.length) looks = await ask({ image: seed.picture, what: 'image' });
			found.push(looks);
			// Only so many pictures are read for the first time in one go; the rest answer from what was kept.
			const fresh = index.imageText(seed.picture) === undefined && reads++ < READ_AT_ONCE;
			const seen = await imageWords(index, env, seed.picture, { fresh }).catch(() => undefined);
			if (seen && seen.length >= READ_WORTH) found.push(await ask({ query: seen, what: 'text' }));
			if (found.some((list) => list.length)) return found;
		}
		if (seed.url) {
			const near = await ask({ like: seed.url });
			if (near.length) return [near];
		}
		return seed.words?.trim() ? [await ask({ query: seed.words })] : [];
	}))).flat();
	const own = new Set(seeds.flatMap((seed) => (seed.url ? [seed.url, index.get(seed.url, { owner, limit: 1 })?.key ?? ''] : [])).filter(Boolean));
	const fused = new Map<string, { hit: SourceHit; score: number }>();
	for (const list of lists) {
		list.forEach((hit, rank) => {
			if (own.has(hit.key) || own.has(hit.url) || (hit.openUrl && own.has(hit.openUrl))) return;
			const had = fused.get(hit.key);
			const score = 1 / (FUSE + rank);
			if (had) had.score += score;
			else fused.set(hit.key, { hit, score });
		});
	}
	return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(({ hit, score }) => ({ ...hit, score: Math.round(score * 1000) / 1000 }));
}

/** How much a list's order counts when lists are put together (reciprocal rank fusion): smaller favours the top of each. */
const FUSE = 10;
