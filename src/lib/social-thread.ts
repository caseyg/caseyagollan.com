/** Splitting long text into a thread of social posts, shared by the syndicate page and its tests. */

/** Longest thread the page offers; the server refuses longer ones. */
export const maxThreadPosts = 20;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

/** `fresh` starts a sentence or word too long for one post, which begins a post of its own. */
interface Piece { text: string; gap: string; fresh?: boolean }

/** Break text into pieces no longer than the limit, largest first: lines, then sentences, then words, then characters. */
function pieces(text: string, fits: (text: string) => boolean): Piece[] {
	const out: Piece[] = [];
	const add = (part: string, gap: string, level: number, fresh = false) => {
		if (!part) return;
		if (fits(part) || level > 3) { out.push({ text: part, gap, fresh }); return; }
		const parts = level === 0 ? part.split(/(\n+)/)
			: level === 1 ? Array.from(sentences.segment(part), s => s.segment)
			: level === 2 ? part.split(/(\s+)/)
			: Array.from(segmenter.segment(part), s => s.segment);
		let first = true;
		for (let i = 0; i < parts.length; i++) {
			const value = level === 1 ? parts[i].trimEnd() : parts[i];
			if (level === 0 || level === 2) { if (i % 2) continue; }
			// The first piece keeps the gap before the whole part; later ones use the gap they had.
			const before = first ? gap : level === 0 ? (parts[i - 1]?.includes('\n\n') ? '\n\n' : '\n') : level === 3 ? '' : ' ';
			if (value.trim() || level === 3) { add(level === 3 ? value : value.trim(), before, level + 1, first && (fresh || level >= 2)); first = false; }
		}
	};
	add(text.trim(), '', 0);
	return out;
}

/**
 * Split text into posts that each fit, breaking between lines, then sentences, then words.
 * The link, when given, ends the last post, or gets a post of its own when it doesn't fit.
 */
export function splitIntoThread(text: string, fits: (text: string) => boolean, link?: string): string[] {
	const posts: string[] = [];
	let current = '';
	for (const piece of pieces(text, fits)) {
		const joined = current ? current + piece.gap + piece.text : piece.text;
		if (!current || (!piece.fresh && fits(joined))) { current = joined; continue; }
		posts.push(current);
		current = piece.text;
	}
	if (link) {
		const ending = current ? `${current}\n\n${link}` : link;
		if (fits(ending)) current = ending;
		else { if (current) posts.push(current); current = link; }
	}
	if (current) posts.push(current);
	return posts.slice(0, maxThreadPosts);
}
