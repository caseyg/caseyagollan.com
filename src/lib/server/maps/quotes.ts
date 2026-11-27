/**
 * One quote for each document on a map. Casey's own highlight always wins. Otherwise sentences
 * are taken from the text, a reject list throws out what is not the author speaking (credits,
 * greetings, cookie banners, sign-up lines), a model chooses among the few that are left, and
 * whatever comes back is used only if it is in the text word for word. A document with nothing
 * worth quoting gets no quote: a blank is better than a wrong one.
 */
import { plainWords, terms } from './text';
import type { MapDoc, MapQuote, QuotesStage } from './types';

export const QUOTE_MAX_WORDS = 34;
export const QUOTE_MIN_WORDS = 7;
/** Candidates shown to the model for each document. */
export const CANDIDATES = 6;

/** What is not the author speaking. One match and the sentence is out. */
const REJECT: RegExp[] = [
	/\b(cookies?|consent|privacy (policy|notice|settings)|terms of (use|service)|gdpr|all rights reserved|copyright|©|\(c\) ?\d{4})\b/i,
	/\b(subscribe|subscription|newsletter|sign ?up|sign ?in|log ?in|register|create an account|free trial|paywall|become a member|membership|donate|support (us|our)|unlimited access|already a subscriber|gift (this )?article)\b/i,
	/\b(click|tap|swipe|scroll) (here|to|on|the|below|above)\b|\b(read more|learn more|see more|continue reading|share this|follow us|join us|contact us|get in touch|download (the|our) app|skip to (main )?content|back to top|view (all|more)|related (posts|articles|stories))\b/i,
	/\b(photo(graph)?s?|images?|illustrations?|video|credit|courtesy|artwork|graphics?|cover|screenshot)s? (by|via|from|courtesy|credit|of)\b|\b(getty|shutterstock|reuters|associated press|ap photo|unsplash|alamy)\b/i,
	/^(hi|hello|hey|dear|welcome|greetings|good (morning|afternoon|evening)|thanks|thank you|happy|cheers|ps|p\.s\.|note|editor|update|correction|disclosure|disclaimer|transcript|listen|watch|advertisement|sponsored)\b/i,
	/\b(this (article|post|story|piece|essay|episode|newsletter|page|site|website) (was|is|originally|first|has been|may|contains|uses)|originally (published|appeared)|was (first )?published|is adapted from|is an excerpt|a version of this|you('re| are) reading|in this (episode|issue|newsletter|video|talk))\b/i,
	/\b(min(ute)?s? read|reading time|words?:|published|posted|updated|last modified|filed under|tagged|comments?|\d+ (likes?|shares?|views|replies|retweets))\b.*\d|\b\d{1,2}:\d{2}\b/i,
	/\b(javascript|browser|enable|disabled|loading|404|not found|access denied|captcha|are you a robot|unsupported)\b.{0,40}\b(required|enable|support|browser|please|page)\b/i,
	/[@#]\w+|https?:|www\.|\.com\b|\[|\]|\||\{|\}|=|<|>|\t/,
	/\b(et al\.|doi|isbn|issn|vol\.|pp\.|fig(ure)?\.? ?\d|table \d|ibid)\b/i,
	// Speech written down as it was spoken.
	/(^|[\s,])(um+|uh+|you know|i mean|kind ?of|sort ?of|gonna|wanna)([\s,.]|$)|, like,|\blike, /i
];

/** Machine transcripts run words together ("aresearch", "kind ofhard"). */
const TRANSCRIPT = new Set(['video', 'podcast']);

/**
 * Words in a transcript that are really two run together: a word the transcript uses once, that
 * splits into two words it uses elsewhere on their own. A sentence holding one can't be quoted,
 * since the quote must be the source's words exactly and these are not words.
 */
function runTogether(text: string): (sentence: string) => boolean {
	const counts = new Map<string, number>();
	for (const word of text.toLowerCase().match(/[\p{L}]+/gu) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1);
	const known = (word: string) => (word.length > 2 ? (counts.get(word) ?? 0) > 0 : /^(a|i|an|as|at|be|by|do|go|he|if|in|is|it|me|my|no|of|on|or|so|to|up|us|we)$/.test(word));
	return (sentence) => (sentence.match(/[\p{L}]+/gu) ?? []).some((word) => {
		if (/\p{Ll}\p{Lu}/u.test(word) || /[,;:!?]\p{L}/u.test(sentence)) return true;
		const low = word.toLowerCase();
		if (low.length < 4 || (counts.get(low) ?? 0) > 1) return false;
		for (let cut = 1; cut < low.length; cut++) if (known(low.slice(0, cut)) && known(low.slice(cut)) && (cut > 2 || low.length - cut > 2)) return true;
		return false;
	});
}

/** How a sentence starts when it leans on the one before it, so reads badly alone. */
const DANGLING = /^(but|and|or|so|yet|nor|this|that|these|those|it|they|he|she|him|her|his|their|its|such|here|there|then|thus|hence|however|moreover|instead|also|still|meanwhile|otherwise|indeed|for example|for instance|in other words|as a result|in fact)\b/i;

const flatten = (value: string) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const countWords = (value: string) => value.split(/\s+/).filter(Boolean).length;

/** A document's words as running prose: no headings, lists, tables, captions or code. */
function prose(markdown: string): string[] {
	return markdown.replace(/```[\s\S]*?```/g, '\n\n').split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block) => block && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|\||!\[|\*[^*]+\*$|---)/.test(block))
		.map((block) => plainWords(block.replace(/^>\s?/gm, '')).replace(/\s+/g, ' ').trim())
		.filter((block) => countWords(block) >= QUOTE_MIN_WORDS);
}

/** Sentences, split where one ends and the next begins with a capital, a quote mark or a digit; common abbreviations don't end one. */
export function sentences(paragraph: string): string[] {
	const guarded = paragraph.replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Inc|Ltd|Co|U\.S|U\.K|a\.m|p\.m)\./g, '$1\u0001');
	return guarded.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[\p{Lu}\d])/u).map((sentence) => sentence.replace(/\u0001/g, '.').trim()).filter(Boolean);
}

/** Whether a sentence could stand on a card as the document's own words. */
export function quotable(sentence: string): boolean {
	const count = countWords(sentence);
	if (count < QUOTE_MIN_WORDS || count > QUOTE_MAX_WORDS || sentence.length > 240) return false;
	if (!/[.!?]["”’)]?$/.test(sentence) || !/^["“‘(]?\p{Lu}/u.test(sentence)) return false;
	const letters = (sentence.match(/\p{L}/gu) ?? []).length;
	if (letters / sentence.length < 0.72) return false;
	const capitals = (sentence.match(/\p{Lu}/gu) ?? []).length;
	if (capitals / Math.max(1, letters) > 0.3) return false;
	// A quote mark left open, or a bracket, means the split cut something in half.
	const marks = (sentence.match(/["“”]/g) ?? []).length;
	if (marks % 2 === 1 || (sentence.match(/\(/g) ?? []).length !== (sentence.match(/\)/g) ?? []).length) return false;
	return !REJECT.some((rule) => rule.test(sentence));
}

/** The few sentences of a document most worth offering as its quote, best first. */
export function candidates(doc: Pick<MapDoc, 'title' | 'text' | 'kind'>, max = CANDIDATES): string[] {
	const paragraphs = prose(doc.text);
	const garbled = TRANSCRIPT.has(doc.kind ?? '') ? runTogether(doc.text) : () => false;
	const all = paragraphs.flatMap((paragraph) => sentences(paragraph));
	// A transcript garbled all through has no sentence that is safely the speaker's words.
	if (all.length && all.filter(garbled).length > all.length * 0.15) return [];
	const about = new Set(terms(doc.title));
	const seen = new Set<string>();
	const scored: { sentence: string; score: number; at: number }[] = [];
	all.forEach((sentence, index) => {
		if (!quotable(sentence) || seen.has(sentence) || garbled(sentence)) return;
		seen.add(sentence);
		const count = countWords(sentence);
		const place = index / Math.max(1, all.length);
		let score = 1 - Math.abs(count - 16) / 24;
		// The top of a page says what it is about; the very end is sign-offs and bios.
		score += place < 0.25 ? 0.5 : place < 0.7 ? 0.25 : place > 0.92 ? -0.4 : 0;
		score += Math.min(0.6, terms(sentence).filter((word) => about.has(word)).length * 0.2);
		if (DANGLING.test(sentence)) score -= 0.6;
		if (/\d/.test(sentence)) score -= 0.1;
		if (/\b(I|we|my|our)\b/.test(sentence)) score += 0.1;
		if (/[?]$/.test(sentence)) score -= 0.15;
		scored.push({ sentence, score, at: index });
	});
	return scored.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max).map((one) => one.sentence);
}

/** Whether `quote` is in the document word for word (curly and straight quote marks, and line breaks, aside). */
export function verbatim(quote: string, doc: Pick<MapDoc, 'text' | 'highlights'>): boolean {
	const wanted = flatten(quote);
	if (!wanted) return false;
	return flatten(plainWords(doc.text)).includes(wanted) || doc.highlights.some((highlight) => flatten(highlight).includes(wanted));
}

/** A highlight as a card's quote: whole when short, else its opening sentences, never cut mid-word. */
export function clipHighlight(highlight: string, max = 220): string {
	const whole = highlight.replace(/\s+/g, ' ').trim();
	if (whole.length <= max) return whole;
	let kept = '';
	for (const sentence of sentences(whole)) { if (kept && (kept + ' ' + sentence).length > max) break; kept = kept ? `${kept} ${sentence}` : sentence; }
	if (kept && kept.length <= max && whole.startsWith(kept)) return kept;
	return whole.slice(0, max).replace(/\s+\S*$/, '');
}

export type Chooser = (prompt: string) => Promise<string>;

const CHOOSE_PER_CALL = 24;
const chooseText = (batch: { n: number; title: string; options: string[] }[]) => [
	'For each numbered source below, choose the one candidate sentence that best stands alone as a quote from it: the author’s own claim, finding or image, something a reader would underline.',
	'Never choose a credit, caption, greeting, sign-up line, navigation, biography or housekeeping; if none of a source’s candidates is worth quoting, answer 0 for it.',
	'Answer with one line per source and nothing else, as `source: choice`, for example `3: 2`.',
	'',
	...batch.flatMap((one) => [`## ${one.n}. ${one.title.slice(0, 120)}`, ...one.options.map((option, index) => `${index + 1}. ${option}`), ''])
].join('\n');

/**
 * Quotes for every document. `choose` asks a model to pick among candidates; without one (or when
 * it fails) the first candidate by the rules is used. Every quote is checked against its source.
 */
export async function pickQuotes(docs: MapDoc[], choose?: Chooser, kept: Record<string, MapQuote | null> = {}): Promise<QuotesStage> {
	const quotes: Record<string, MapQuote | null> = {};
	const open: { doc: MapDoc; options: string[] }[] = [];
	for (const doc of docs) {
		const highlight = doc.highlights.map((one) => clipHighlight(one)).find((one) => countWords(one) >= 3);
		if (highlight) { quotes[doc.id] = { text: highlight, from: 'highlight' }; continue; }
		// A quote already chosen stands while it is still in the text, so a re-run changes only what changed.
		const before = kept[doc.id];
		if (before && before.from !== 'highlight' && verbatim(before.text, doc)) { quotes[doc.id] = before; continue; }
		const options = candidates(doc);
		if (!options.length) { quotes[doc.id] = null; continue; }
		open.push({ doc, options });
	}
	const byRule = (one: (typeof open)[number]): MapQuote => ({ text: one.options[0], from: 'rule' });
	for (let start = 0; start < open.length; start += CHOOSE_PER_CALL) {
		const batch = open.slice(start, start + CHOOSE_PER_CALL);
		let answer = '';
		if (choose) { try { answer = await choose(chooseText(batch.map((one, index) => ({ n: index + 1, title: one.doc.title, options: one.options })))); } catch { answer = ''; } }
		const picks = new Map<number, number>();
		for (const match of answer.matchAll(/^\W*(\d+)\W+(\d+)\b/gm)) picks.set(Number(match[1]), Number(match[2]));
		batch.forEach((one, index) => {
			const pick = picks.get(index + 1);
			if (pick === 0) { quotes[one.doc.id] = null; return; }
			const chosen = pick !== undefined ? one.options[pick - 1] : undefined;
			const quote: MapQuote = chosen ? { text: chosen, from: 'model' } : byRule(one);
			quotes[one.doc.id] = verbatim(quote.text, one.doc) ? quote : null;
		});
	}
	return { quotes };
}
