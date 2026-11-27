/**
 * Likeness between saved things, pictures included. Each document's words, and its picture when it
 * has one, are embedded with a multimodal model on Workers AI (`@cf/google/embeddinggemma-2`, which
 * puts text and images in one space and keeps nothing it is sent), so words find pictures and a
 * picture finds pictures like it. The vectors live in the index's own database, beside the
 * documents, and are compared there: no other service holds them.
 *
 * Without the `AI` binding none of this runs, and the rest of the cache works as before.
 */
import { viewImage } from '../chat/view-image';
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
export interface EmbedEnv { AI?: { run(model: string, input: EmbedInput): Promise<unknown> }; IMAGES?: ImagesBinding }

async function run(env: EmbedEnv, input: Omit<EmbedInput, 'dimensions'>): Promise<number[][]> {
	const answer = (await env.AI!.run(EMBED_MODEL, { ...input, dimensions: EMBED_DIMENSIONS })) as { data?: { index?: number; embedding?: number[] }[] };
	const data = [...(answer.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((entry) => entry.embedding ?? []);
	if (!data.length || data.some((vector) => !vector.length)) throw new Error('The embedding model sent no vectors.');
	return data;
}

/** The model's own way of marking what is a document and what is a question. */
export const asDocument = (title: string, text: string) => `title: ${title.replace(/\s+/g, ' ').trim() || 'none'} | text: ${text}`;
export const asQuery = (words: string) => `task: search result | query: ${words}`;

async function picture(env: EmbedEnv, url: string): Promise<string> {
	const image = await viewImage(url, { origin: 'https://caseyagollan.com/', images: env.IMAGES });
	return `data:${image.mimeType};base64,${image.data}`;
}

/** Embeds a batch of what has no vector yet. `left` says there is more to do. */
export async function embedPending(index: SourceIndex, env: EmbedEnv): Promise<{ text: number; images: number; left: boolean }> {
	if (!env.AI) return { text: 0, images: 0, left: false };
	const stamp = new Date().toISOString();
	const documents = index.unembedded('text', TEXT_BATCH);
	if (documents.length) {
		const inputs = documents.map((document) => asDocument(document.title, [document.summary, document.highlights, document.text].filter(Boolean).join('\n\n').slice(0, TEXT_CHARS)));
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
			const [vector] = await run(env, { messages: [[{ role: 'user', content: [{ type: 'image_url', image_url: { url: await picture(env, document.image!) } }] }]] });
			index.saveVector(document.key, 'image', vector);
			index.embedded('image', [document.key], stamp);
			images++;
		} catch {
			index.embedded('image', [document.key], 'failed');
		}
	}
	return { text: documents.length, images, left: documents.length === TEXT_BATCH || pictured.length === IMAGE_BATCH };
}

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
		[vector] = await run(env, { input: [asQuery(options.query.trim().slice(0, 500))] });
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
