import type { InsightSource } from './insight-types';

/** Owner choices about which sources the homepage graph shows. */
export interface GraphCuration {
	/** Sources always shown under a topic, keyed by the topic's node id, newest first. */
	pinned: Record<string, InsightSource[]>;
	blockedUrls: string[];
	/** Hostnames without `www.`; subdomains are blocked too. */
	blockedDomains: string[];
}

export type CurationAction =
	| { action: 'pin'; topic: string; source: InsightSource }
	| { action: 'unpin'; topic: string; url: string }
	| { action: 'block-url'; url: string }
	| { action: 'block-domain'; url: string }
	| { action: 'attach'; topic: string; url: string };

export const emptyCuration = (): GraphCuration => ({ pinned: {}, blockedUrls: [], blockedDomains: [] });

const MAX_TOPIC = 200;
const MAX_TEXT = 500;
const MAX_PINNED = 20;
const MAX_BLOCKED = 1000;

/** Compares URLs the way a reader would: no fragment, no trailing slash, no `www.`. */
export function urlKey(value: string): string {
	try {
		const url = new URL(value);
		url.hash = '';
		const host = url.hostname.toLowerCase().replace(/^www\./, '');
		const path = url.pathname.replace(/\/+$/, '');
		return `${host}${url.port ? `:${url.port}` : ''}${path}${url.search}`;
	} catch {
		return value.trim();
	}
}

export function domainOf(value: string): string | null {
	try {
		const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
		return host || null;
	} catch {
		return null;
	}
}

export function isBlocked(url: string, curation: GraphCuration): boolean {
	const key = urlKey(url);
	if (curation.blockedUrls.some((blocked) => urlKey(blocked) === key)) return true;
	const host = domainOf(url);
	return !!host && curation.blockedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isPinned(topic: string, url: string, curation: GraphCuration): boolean {
	const key = urlKey(url);
	return (curation.pinned[topic] ?? []).some((source) => urlKey(source.url) === key);
}

/** A topic's sources as the graph shows them: pinned first, then the rest, without blocked or repeated URLs. */
export function curateSources(topic: string, sources: InsightSource[] = [], curation: GraphCuration): InsightSource[] {
	const seen = new Set<string>();
	const result: InsightSource[] = [];
	const pinned = (curation.pinned[topic] ?? []).map((source) => ({ ...source, pinned: true }));
	for (const source of [...pinned, ...sources]) {
		const key = urlKey(source.url);
		if (seen.has(key) || isBlocked(source.url, curation)) continue;
		seen.add(key);
		result.push(source);
	}
	return result;
}

/**
 * Every topic's sources as the graph shows them: pinned, then `leading` (such as Casey's own wiki
 * pages), then the topic's search results. Includes topics that only have pinned or leading sources.
 */
export function curateInsights<T extends { sources?: InsightSource[] }>(
	insights: Map<string, T>,
	curation: GraphCuration,
	leading: Map<string, InsightSource[]> = new Map()
): Map<string, T | { sources: InsightSource[] }> {
	const result = new Map<string, T | { sources: InsightSource[] }>();
	const sources = (topic: string, rest: InsightSource[] = []) => curateSources(topic, [...(leading.get(topic) ?? []), ...rest], curation);
	for (const [topic, insight] of insights) result.set(topic, { ...insight, sources: sources(topic, insight.sources) });
	for (const topic of [...Object.keys(curation.pinned), ...leading.keys()]) {
		if (!result.has(topic)) {
			const list = sources(topic);
			if (list.length) result.set(topic, { sources: list });
		}
	}
	return result;
}

export function httpUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 2048) return null;
	try {
		const url = new URL(value.trim());
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (url.username || url.password) return null;
		return url.href;
	} catch {
		return null;
	}
}

const text = (value: unknown, max = MAX_TEXT) => (typeof value === 'string' ? value.slice(0, max) : null);

export function cleanSource(value: unknown): InsightSource | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const url = httpUrl(raw.url);
	if (!url) return null;
	return { url, title: text(raw.title) || domainOf(url) || url, page_age: text(raw.page_age, 64), cited_text: text(raw.cited_text) };
}

/** Reads stored or posted curation defensively; anything malformed is dropped. */
export function parseCuration(value: unknown): GraphCuration {
	const curation = emptyCuration();
	if (!value || typeof value !== 'object') return curation;
	const raw = value as Record<string, unknown>;
	if (raw.pinned && typeof raw.pinned === 'object') {
		for (const [topic, sources] of Object.entries(raw.pinned as Record<string, unknown>)) {
			if (!topic || topic.length > MAX_TOPIC || !Array.isArray(sources)) continue;
			const clean = sources.map(cleanSource).filter((source): source is InsightSource => !!source).slice(0, MAX_PINNED);
			if (clean.length) curation.pinned[topic] = clean;
		}
	}
	if (Array.isArray(raw.blockedUrls)) curation.blockedUrls = raw.blockedUrls.map(httpUrl).filter((url): url is string => !!url).slice(0, MAX_BLOCKED);
	if (Array.isArray(raw.blockedDomains)) {
		curation.blockedDomains = raw.blockedDomains
			.filter((domain): domain is string => typeof domain === 'string' && /^[a-z0-9.-]{1,253}$/i.test(domain))
			.map((domain) => domain.toLowerCase().replace(/^www\./, ''))
			.slice(0, MAX_BLOCKED);
	}
	return curation;
}

export function validTopic(value: unknown): string | null {
	return typeof value === 'string' && value.trim() && value.length <= MAX_TOPIC ? value : null;
}

/** Applies one owner action. `attach` takes the fetched source as a `pin`. Returns a new object. */
export function applyAction(curation: GraphCuration, action: Exclude<CurationAction, { action: 'attach' }>): GraphCuration {
	const next: GraphCuration = { pinned: { ...curation.pinned }, blockedUrls: [...curation.blockedUrls], blockedDomains: [...curation.blockedDomains] };
	switch (action.action) {
		case 'pin': {
			const key = urlKey(action.source.url);
			const rest = (next.pinned[action.topic] ?? []).filter((source) => urlKey(source.url) !== key);
			next.pinned[action.topic] = [action.source, ...rest].slice(0, MAX_PINNED);
			// Pinning is the way back from a block of this exact URL.
			next.blockedUrls = next.blockedUrls.filter((url) => urlKey(url) !== key);
			break;
		}
		case 'unpin': {
			const key = urlKey(action.url);
			const rest = (next.pinned[action.topic] ?? []).filter((source) => urlKey(source.url) !== key);
			if (rest.length) next.pinned[action.topic] = rest;
			else delete next.pinned[action.topic];
			break;
		}
		case 'block-url': {
			const key = urlKey(action.url);
			if (!next.blockedUrls.some((url) => urlKey(url) === key)) next.blockedUrls.push(action.url);
			unpinEverywhere(next, (url) => urlKey(url) === key);
			break;
		}
		case 'block-domain': {
			const domain = domainOf(action.url);
			if (domain && !next.blockedDomains.includes(domain)) next.blockedDomains.push(domain);
			if (domain) unpinEverywhere(next, (url) => { const host = domainOf(url); return !!host && (host === domain || host.endsWith(`.${domain}`)); });
			break;
		}
	}
	return next;
}

function unpinEverywhere(curation: GraphCuration, match: (url: string) => boolean) {
	for (const [topic, sources] of Object.entries(curation.pinned)) {
		const rest = sources.filter((source) => !match(source.url));
		if (rest.length) curation.pinned[topic] = rest;
		else delete curation.pinned[topic];
	}
}

/** Pulls `<title>` and a description out of a page's HTML, without a DOM. */
export function pageSummary(html: string, url: string): InsightSource {
	const decode = (value: string) =>
		value
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#0?39;|&apos;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
			.replace(/\s+/g, ' ')
			.trim();
	const meta = (name: string) => {
		for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
			const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
			if (key !== name) continue;
			const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
			const value = content?.[1] ?? content?.[2];
			if (value) return decode(value);
		}
		return null;
	};
	const title = meta('og:title') ?? (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]) : null);
	const description = meta('og:description') ?? meta('description');
	return { url, title: (title || domainOf(url) || url).slice(0, MAX_TEXT), page_age: null, cited_text: description ? description.slice(0, MAX_TEXT) : null };
}
