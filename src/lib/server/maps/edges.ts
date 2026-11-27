/**
 * A map's ties, in two tiers. The backbone is fact: one saved page links to another, two cite the
 * same page elsewhere, or two are the same story saved twice. The rest is likeness (TF-IDF over
 * title and text, or simply the same site), kept sparse so it decorates the backbone and never
 * buries it: each document's nearest few, and one loose tie for anything that would stand alone.
 */
import { hostOf, languageOf, likeness, normalUrl } from './text';
import type { LinksStage, MapDoc, MapEdge } from './types';

export interface EdgeOptions {
	/** The most likeness ties a document asks for. 0 leaves only the backbone. */
	similar?: number;
	/** How alike two documents must be to be tied, 0 to 1. */
	threshold?: number;
}

/** Hosts whose pages have nothing in common but the host. */
const SHARED_HOSTS = /^(youtube\.com|youtu\.be|x\.com|twitter\.com|github\.com|are\.na|medium\.com|substack\.com|linkedin\.com|facebook\.com|instagram\.com|reddit\.com|news\.ycombinator\.com|archive\.org|web\.archive\.org|doi\.org|arxiv\.org|wikipedia\.org|[a-z]+\.wikipedia\.org|bsky\.app|vimeo\.com|soundcloud\.com|docs\.google\.com|drive\.google\.com|zenodo\.org|t\.co|bit\.ly)$/;
/** Addresses every page carries: share buttons, sign-ins, policies, feeds, pictures and files of the page itself. */
const FURNITURE = /(\/(intent|share|sharer|sharing|login|signin|sign-in|signup|sign-up|subscribe|account|privacy|terms|cookies?|about|contact|feed|rss|tag|tags|category|author|search)(\/|\?|$))|\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)(\?|$)|^(creativecommons\.org|fonts\.googleapis\.com|schema\.org|gravatar\.com|w3\.org|apple\.com\/app|apps\.apple\.com|play\.google\.com)/i;

/** A profile, channel or help page: where a site says to follow it, not something its articles are about. */
const PROFILE = /^((facebook|instagram|threads|tiktok|x|linkedin|youtube|bsky|mastodon|whatsapp|t|telegram|pinterest|flipboard|twitch|patreon|open\.spotify|podcasts\.apple)\.[a-z.]+\/(@|profile\/|channel\/|company\/|in\/|c\/|user\/|show\/)?[^/?]+\/?(\?.*)?$|(help|support|status|shop|store|jobs|careers|account|accounts|login|auth|id)\.)/i;

const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const titleKey = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function buildEdges(docs: MapDoc[], options: EdgeOptions = {}): LinksStage {
	const most = Math.max(0, Math.min(6, options.similar ?? 3));
	const threshold = options.threshold ?? 0.2;
	const edges = new Map<string, MapEdge>();
	const add = (edge: MapEdge) => { const key = pairKey(edge.from, edge.to); if (edge.from !== edge.to && !edges.has(key)) edges.set(key, edge); };

	// Every address a document answers to: its page, and where its card opens.
	const byUrl = new Map<string, string>();
	const own = new Map<string, Set<string>>();
	for (const doc of docs) {
		const mine = new Set([normalUrl(doc.url), normalUrl(doc.open)].filter((url): url is string => !!url));
		own.set(doc.id, mine);
		for (const url of mine) if (!byUrl.has(url)) byUrl.set(url, doc.id);
	}

	// Tier one: a link from one to another, then pages elsewhere that two or more cite.
	const cited = new Map<string, Set<string>>();
	for (const doc of docs) {
		const site = hostOf(doc.url);
		for (const link of new Set(doc.links.map(normalUrl).filter((url): url is string => !!url))) {
			if (own.get(doc.id)!.has(link)) continue;
			const target = byUrl.get(link);
			if (target) { add({ from: doc.id, to: target, kind: 'link', strong: true, weight: 1, label: 'links to' }); continue; }
			const host = link.split(/[/?]/)[0];
			// A site's links to itself are its menus; a bare domain or a share button cites nothing.
			if (host === site || !link.includes('/') || /^[^/]+\/?$/.test(link) || FURNITURE.test(link) || FURNITURE.test(link.slice(host.length)) || PROFILE.test(link)) continue;
			if (!cited.has(link)) cited.set(link, new Set());
			cited.get(link)!.add(doc.id);
		}
	}
	const citations: LinksStage['citations'] = [];
	const crowd = Math.max(5, Math.ceil(docs.length * 0.15));
	for (const [url, by] of [...cited].filter(([, by]) => by.size > 1).sort((a, b) => a[1].size - b[1].size)) {
		// Cited by a crowd, it is a footer or a platform, not a source they share.
		if (by.size > crowd) continue;
		const ids = [...by];
		citations.push({ url, by: ids });
		const label = `both cite ${url.split(/[/?]/)[0]}`;
		if (ids.length <= 3) { for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add({ from: ids[i], to: ids[j], kind: 'cites', strong: true, weight: 1, label, via: url }); }
		else for (let i = 1; i < ids.length; i++) add({ from: ids[0], to: ids[i], kind: 'cites', strong: true, weight: 1, label, via: url });
	}

	// The same story saved twice (the video and the article of one talk): one title, or near-identical words.
	const byTitle = new Map<string, string>();
	for (const doc of docs) {
		const key = titleKey(doc.title);
		if (key.length < 16) continue;
		const twin = byTitle.get(key);
		if (twin) add({ from: twin, to: doc.id, kind: 'same', strong: true, weight: 1, label: 'same story' }); else byTitle.set(key, doc.id);
	}

	const languages: Record<string, number> = {};
	const texts = docs.map((doc) => { const language = languageOf(`${doc.title}. ${doc.text}`); languages[language] = (languages[language] ?? 0) + 1; return { id: doc.id, title: doc.title, text: doc.text, language }; });
	if (most > 0 && docs.length > 1) {
		const pairs = likeness(texts, Math.min(threshold, 0.08));
		for (const pair of pairs) if (pair.score >= 0.9 && pair.cover >= 0.6) add({ from: pair.a, to: pair.b, kind: 'same', strong: true, weight: 1, label: 'same story' });
		// Tier two. Each document's nearest few; a tie is kept when both name each other, or it is either's very nearest.
		const nearest = new Map<string, typeof pairs>();
		for (const pair of pairs) for (const id of [pair.a, pair.b]) { const list = nearest.get(id) ?? []; if (list.length < most) list.push(pair); nearest.set(id, list); }
		const similar = (pair: (typeof pairs)[number]): MapEdge => ({ from: pair.a, to: pair.b, kind: 'similar', strong: false, weight: Math.min(0.8, 0.25 + pair.score), ...(pair.shared.length ? { label: pair.shared.slice(0, 2).join(', ') } : {}) });
		for (const pair of pairs) {
			if (pair.score < threshold) break;
			const mine = nearest.get(pair.a) ?? [], theirs = nearest.get(pair.b) ?? [];
			if ((mine.includes(pair) && theirs.includes(pair)) || mine[0] === pair || theirs[0] === pair) add(similar(pair));
		}
		// The same site, where it is a publication and not a platform: a light chain, oldest to newest.
		const bySite = new Map<string, MapDoc[]>();
		for (const doc of docs) { const site = hostOf(doc.url); if (site && !SHARED_HOSTS.test(site)) bySite.set(site, [...(bySite.get(site) ?? []), doc]); }
		for (const [site, group] of bySite) {
			if (group.length < 2 || group.length > 6) continue;
			const ordered = group.toSorted((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
			for (let index = 1; index < ordered.length; index++) add({ from: ordered[index - 1].id, to: ordered[index].id, kind: 'site', strong: false, weight: 0.3, label: site });
		}
		// Nothing is left alone if anything is even loosely like it.
		const tied = new Set([...edges.values()].flatMap((edge) => [edge.from, edge.to]));
		for (const doc of docs) {
			if (tied.has(doc.id)) continue;
			const best = nearest.get(doc.id)?.[0];
			if (best) { add({ ...similar(best), weight: 0.25 }); tied.add(best.a); tied.add(best.b); }
		}
	}
	return { edges: [...edges.values()], citations: citations.sort((a, b) => b.by.length - a.by.length).slice(0, 40), languages };
}
