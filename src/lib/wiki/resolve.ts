import type { WikiManifest, WikiSourcePage } from './types';

export const WIKI_SITE = 'https://cag.wiki/';
/** Where Obsidian Publish serves the vault's files, such as page Markdown and images. */
export const WIKI_FILES = 'https://publish-01.obsidian.md/access/8fa0f73a8388b8a25449a2b468e98cd2/';

/** Decode a cag.wiki path segment, where Obsidian Publish writes spaces as `+`. */
function decodeSegment(segment: string) {
	try {
		return decodeURIComponent(segment.replace(/\+/g, ' '));
	} catch {
		return segment;
	}
}

/** How a name is compared: case, spacing and punctuation don't matter. */
export function wikiKey(name: string): string {
	return name
		.normalize('NFKC')
		.toLowerCase()
		.replace(/\.md$/, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

/** The page's address on this site, under /wiki/: its cag.wiki permalink, made URL-friendly. */
export function wikiSlug(page: Pick<WikiSourcePage, 'url'>): string {
	const path = new URL(page.url).pathname.replace(/^\/+|\/+$/g, '');
	return path.split('/').map((segment) => wikiKey(decodeSegment(segment))).filter(Boolean).join('/') || 'index';
}

export const wikiPath = (slug: string) => `/wiki/${slug}`;

/** Every name a page can be linked by. */
export function wikiNames(page: WikiSourcePage): string[] {
	const file = page.path.replace(/\.md$/, '');
	return [file, file.split('/').at(-1)!, page.title, ...page.aliases, wikiSlug(page)];
}

export function wikiManifest(pages: WikiSourcePage[]): WikiManifest {
	const manifest: WikiManifest = {};
	// Slugs first, so a page's own address always wins over another page's alias.
	for (const page of pages) manifest[wikiSlug(page)] = wikiSlug(page);
	for (const page of pages) {
		for (const name of wikiNames(page)) {
			const key = wikiKey(name);
			if (key && !(key in manifest)) manifest[key] = wikiSlug(page);
		}
	}
	return manifest;
}

/**
 * The slug of the page a cag.wiki address leads to, or null for another site or an unpublished page.
 * Old addresses that include folders (`/public/til/Working+in+public`) are matched by their last part.
 */
export function resolveWikiUrl(href: string, manifest: WikiManifest): { slug: string; hash: string } | null {
	let url: URL;
	try {
		url = new URL(href, WIKI_SITE);
	} catch {
		return null;
	}
	if (!/^(www\.)?cag\.wiki$/.test(url.hostname)) return null;
	const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
	const hash = url.hash;
	if (!segments.length) return { slug: '', hash };
	const slug = manifest[wikiKey(segments.join('/'))] ?? manifest[wikiKey(segments.at(-1)!)];
	return slug ? { slug, hash } : null;
}

/** The on-site address for a cag.wiki link, or null to leave the link as it is. */
export function localWikiHref(href: string, manifest: WikiManifest): string | null {
	const found = resolveWikiUrl(href, manifest);
	if (!found) return null;
	return found.slug ? `${wikiPath(found.slug)}${found.hash}` : '/wiki/';
}

const ANCHOR = /<a\b[^>]*>/g;
const HREF = /\shref="(https?:\/\/(?:www\.)?cag\.wiki(?:\/[^"]*)?)"/;

/**
 * Point every cag.wiki link in rendered HTML at the wiki browser, where the page is published.
 * A link that opened a new tab for the other site now stays in this one.
 */
export function localizeWikiLinks(html: string, manifest: WikiManifest): string {
	if (!html.includes('cag.wiki')) return html;
	return html.replace(ANCHOR, (tag) => {
		const href = HREF.exec(tag)?.[1];
		const local = href && localWikiHref(href.replace(/&amp;/g, '&'), manifest);
		if (!local) return tag;
		return tag.replace(HREF, ` href="${local}"`).replace(/\starget="[^"]*"/, '');
	});
}
