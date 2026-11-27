/**
 * The words side of a map (`table_map`): telling addresses apart, reading a document's language,
 * and scoring how alike two documents are. Pure, so every stage that leans on it can be tested
 * and re-run alone.
 */

/** Query parameters that say where a visitor came from, not what the page is. */
const TRACKING = /^(utm_[a-z0-9_]+|ref|ref_src|ref_url|referrer|source|src|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|s|t|share|shared|cmpid|campaign|smid|smtyp|partner|ocid|ncid|cid|trk|trkid|spm|_hsenc|_hsmi|hss_channel|oly_anon_id|oly_enc_id|__s|vero_id|ck_subscriber_id|feature|ab_channel|pp|at_medium|at_campaign)$/i;

/**
 * An address as the thing it names: no scheme, `www.`, tracking parameters, fragment or trailing
 * slash, so two links to one page compare equal however each was shared. YouTube's short and
 * long forms come out the same.
 */
export function normalUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	let url: URL;
	try { url = new URL(value.trim()); } catch { return null; }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	let host = url.hostname.toLowerCase().replace(/^(www|m|mobile|amp)\./, '');
	let path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/(index\.(html?|php)|amp)?$/i, '');
	const params = [...url.searchParams].filter(([key]) => !TRACKING.test(key));
	if (host === 'youtu.be') { params.unshift(['v', path.slice(1)]); host = 'youtube.com'; path = '/watch'; }
	if (host === 'youtube.com' && path === '/watch') { const video = params.find(([key]) => key === 'v'); return video ? `youtube.com/watch?v=${video[1]}` : 'youtube.com/watch'; }
	if (host === 'twitter.com') host = 'x.com';
	params.sort(([a], [b]) => a.localeCompare(b));
	const query = params.map(([key, word]) => `${key}=${word}`).join('&');
	return `${host}${path}${query ? `?${query}` : ''}`;
}

/** The site an address is on, without `www.`. */
export const hostOf = (value: string): string => { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^(www|m|mobile|amp)\./, ''); } catch { return ''; } };

/** Every address a Markdown or HTML text links to, in the order they appear. Pictures are not links. */
export function linksIn(text: string): string[] {
	const found: string[] = [];
	for (const match of text.matchAll(/(!?)\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|href=["'](https?:\/\/[^"']+)["']|(?<![("'=])\bhttps?:\/\/[^\s<>"')\]]+/g)) {
		if (match[1] === '!') continue;
		found.push((match[2] ?? match[3] ?? match[0]).replace(/[.,;:!?]+$/, ''));
	}
	return found;
}

/** Markdown as the words a reader sees: no link targets, pictures, code, headings' marks or emphasis marks. */
export function plainWords(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
		.replace(/(\*\*|__|\*|_|`)/g, '')
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
		.replace(/[ \t]+/g, ' ')
		.trim();
}

/** Small words of each language the site's saves turn up in: enough to tell languages apart and to leave out of likeness. */
const STOP: Record<string, string> = {
	en: 'the of and to in is that it for was on are as with his they at be this from have or one had by but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see no way could people my than first been call who its now find long down day did get come made may part over new after also back only our work know take year because good very just most us any where much before through too mean same tell does set three want well such here why ask went men read need off should still between under never last let thought might while those both being until more than yeah yes okay really actually going gonna thing things something anything everything lot kind sort got think right maybe don didn doesn isn wasn aren can won couldn wouldn shouldn that there what let you they we he she it i ll ve re',
	de: 'der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis mehr durch man sein wurde sei',
	fr: 'le la les de des du et à un une en que qui dans pour pas au sur ce il elle est sont avec plus par ne se son sa ses mais ou où comme nous vous ils elles été être cette ces leur aux tout fait aussi',
	es: 'el la los las de del y a en que un una es por con no para se su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros',
	it: 'il lo la i gli le di del della dei e a in che un una è per con non su si da al come più ma anche sono o nel nella alla ha questo questa tra fra essere stato loro cui delle degli dal dalla ai',
	pt: 'o a os as de do da dos das e em que um uma é para com não por se no na mais como mas ao ou seu sua também foi são pelo pela até isso ela ele entre quando muito nos já está',
	nl: 'de het een van en in is dat op te voor met niet zijn er aan ook als bij door om maar uit naar dan nog wel over tot wordt heeft hij ze die dit deze was werd kan',
	da: 'og i det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind når være dog noget ville jeg',
	sv: 'och i att det som en på är av för med till den har de inte om ett han men var jag sig från vi så kan man när år säger hon under också efter eller nu sin där vid mot ska skulle',
	no: 'og i det som på er en til å for av med at de ikke den har jeg om et men så seg hun han var vi kan fra skal ved eller etter også blir være bare'
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([language, words]) => [language, new Set(words.split(' '))]));

export const wordsOf = (text: string): string[] => text.toLowerCase().normalize('NFKC').match(/[\p{L}][\p{L}\p{N}-]*[\p{L}\p{N}]|[\p{L}]/gu) ?? [];

/** The language a text is mostly written in, by which language's small words it uses most; `en` when there is too little to tell. */
export function languageOf(text: string): string {
	const words = wordsOf(text.slice(0, 6000));
	if (words.length < 12) return 'en';
	let best = 'en', most = 0;
	for (const [language, stop] of Object.entries(STOP_SETS)) {
		const hits = words.reduce((sum, word) => sum + (stop.has(word) ? 1 : 0), 0);
		// English's list is the longest, so the others are weighed up a little against it.
		const weighed = language === 'en' ? hits : hits * 1.25;
		if (weighed > most) { most = weighed; best = language; }
	}
	return most / words.length < 0.08 ? 'en' : best;
}

/** The words that say what a text is about: no small words, numbers or one-letter scraps, plurals folded lightly. */
export function terms(text: string, language = 'en'): string[] {
	const stop = STOP_SETS[language] ?? STOP_SETS.en, english = STOP_SETS.en;
	return wordsOf(text).filter((word) => word.length > 2 && word.length < 30 && !stop.has(word) && !english.has(word) && !/^\d/.test(word))
		.map((word) => word.replace(/(?<=[a-z]{4})(ies)$/, 'y').replace(/(?<=[a-z]{3}[^s])s$/, ''));
}

export interface TextDoc { id: string; title: string; text: string; language?: string }
export interface Likeness { a: string; b: string; score: number; shared: string[] }

/**
 * How alike each pair of documents is: TF-IDF cosine over title (counted three times) and body.
 * Only documents in one language are compared, since two texts in Danish share Danish before they
 * share a subject. Each pair comes with the telling words they have in common.
 */
export function likeness(docs: TextDoc[], floor = 0.05): Likeness[] {
	const bags = docs.map((doc) => {
		const language = doc.language ?? languageOf(`${doc.title}. ${doc.text}`);
		const counts = new Map<string, number>();
		const add = (word: string, by: number) => counts.set(word, (counts.get(word) ?? 0) + by);
		for (const word of terms(doc.title, language)) add(word, 3);
		for (const word of terms(plainWords(doc.text.slice(0, 40_000)), language)) add(word, 1);
		return { id: doc.id, language, counts };
	});
	const seenIn = new Map<string, number>();
	for (const bag of bags) for (const word of bag.counts.keys()) seenIn.set(word, (seenIn.get(word) ?? 0) + 1);
	const total = bags.length;
	const vectors = bags.map((bag) => {
		const weights = new Map<string, number>();
		let square = 0;
		for (const [word, count] of bag.counts) {
			const spread = seenIn.get(word)!;
			// A word every document uses says nothing; a word only one uses can't join two.
			if (spread < 2 || spread > Math.max(2, total * 0.5)) continue;
			const weight = (1 + Math.log(count)) * Math.log(1 + total / spread);
			weights.set(word, weight);
			square += weight * weight;
		}
		return { ...bag, weights, length: Math.sqrt(square) };
	});
	const pairs: Likeness[] = [];
	for (let i = 0; i < vectors.length; i++) for (let j = i + 1; j < vectors.length; j++) {
		const one = vectors[i], two = vectors[j];
		if (one.language !== two.language || !one.length || !two.length) continue;
		const [small, large] = one.weights.size <= two.weights.size ? [one, two] : [two, one];
		let dot = 0;
		const shared: [string, number][] = [];
		for (const [word, weight] of small.weights) { const other = large.weights.get(word); if (other) { dot += weight * other; shared.push([word, weight * other]); } }
		const score = dot / (one.length * two.length);
		if (score >= floor) pairs.push({ a: one.id, b: two.id, score, shared: shared.sort((x, y) => y[1] - x[1]).slice(0, 3).map(([word]) => word) });
	}
	return pairs.sort((x, y) => y.score - x.score);
}
