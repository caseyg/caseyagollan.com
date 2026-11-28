/**
 * Where the voice note's known words are kept: one private object in `PUBLISHING_STATE`
 * (`private/voice/words.json`), beside the site's other owner-only state, so the list is the same
 * on every device the owner signs in on. The site has one owner; the words are theirs alone.
 */
import { cleanWords } from '../voice-notes';

const KEY = 'private/voice/words.json';
type Bucket = Pick<R2Bucket, 'get' | 'put'>;

export async function readWords(bucket: Bucket | undefined): Promise<string[]> {
	const kept = bucket ? await (await bucket.get(KEY).catch(() => null))?.json<{ words?: unknown }>().catch(() => null) : null;
	return cleanWords(kept?.words);
}

/** Adds words (newest first) and takes words out, whatever their capitals; answers the list as kept. */
export async function changeWords(bucket: Bucket, add: unknown, remove: unknown): Promise<string[]> {
	const gone = new Set(cleanWords(remove).map((word) => word.toLowerCase()));
	const words = cleanWords([...cleanWords(add), ...(await readWords(bucket))]).filter((word) => !gone.has(word.toLowerCase()));
	await bucket.put(KEY, JSON.stringify({ words, updatedAt: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
	return words;
}
