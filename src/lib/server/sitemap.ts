import type { Post } from '../posts-types';
import { getPostPermalink, POST_TYPE_PLURALS } from '../posts-types';
import { SITE_URL } from '../feeds';
import { isPublicPost } from './parse-post';

/**
 * The site's own pages for search engines: the main sections, every public post, and the type
 * and tag listings. Wiki pages are left to cag.wiki's own sitemap, since that is their home, and
 * filtered, date and paged listings are left out because they repeat what these already list.
 */
const SECTIONS = ['/', '/posts/', '/tags/', '/library/', '/wiki/', '/subscribe/'];

function xml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lastModified(post: Post): string | undefined {
	const times = [Date.parse(post.date), post.updated ? Date.parse(post.updated) : NaN].filter(Number.isFinite);
	return times.length ? new Date(Math.max(...times)).toISOString() : undefined;
}

export function serializeSitemap(posts: Post[]): string {
	const visible = posts.filter((post) => isPublicPost(post) && Number.isFinite(Date.parse(post.date)));
	const urls = new Map<string, string | undefined>();
	const add = (path: string, modified?: string) => {
		// Pages are served without the trailing slash (a slash redirects), so list the final address.
		const href = new URL(path.length > 1 ? path.replace(/\/+$/, '') : path, SITE_URL).href;
		const known = urls.get(href);
		if (!urls.has(href) || (modified && (!known || modified > known))) urls.set(href, modified);
	};
	for (const path of SECTIONS) add(path);
	for (const type of new Set(visible.map((post) => post.type))) {
		const plural = POST_TYPE_PLURALS[type];
		if (plural) add(`/type/${plural}/`);
	}
	// Tag pages are keyed by the lowercased tag, as in getTagCounts ($lib/server/posts-menu).
	for (const post of visible) for (const tag of [post.category ?? []].flat()) add(`/tags/${tag.toLowerCase()}/`);
	for (const post of visible.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) add(getPostPermalink(post), lastModified(post));
	const entries = [...urls].map(([loc, modified]) => `<url><loc>${xml(loc)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}
