/**
 * Table blocks drawn as they read where they came from: a note as the site's own social post, a
 * repost or like as the Bluesky or Mastodon post it saved. Shared by the canvas, the source.json
 * route that serves the post, and their tests.
 */
import type { Post } from './posts-types';
import type { SocialSnapshot } from './social-snapshots';
import { postDetailSnapshots } from './utils/post-details';
import { POST_ICON, type Block } from './tables';

/** The post types a table draws as social posts. Their pages have a `source.json`. */
export const SOURCE_POST_TYPES: ReadonlySet<string> = new Set(['note', 'reply', 'like', 'repost']);
const SOURCE_ICONS = new Set([...SOURCE_POST_TYPES].map((type) => POST_ICON[type]));
/** The emoji `piecesIn` gives a social post taken out of a page, by network. */
const PIECE_ICONS = new Set(['🦋', '🐘']);

const POST_PATH = /^\/\d{4}\/\d{2}\/\d{2}\/[^/?#]+\/?$/;

/**
 * A block for one of the site's notes, replies, likes or reposts. Blocks keep the type's emoji from
 * search (`POST_ICON`), so older tables are recognised too.
 */
export const isSourcePost = (block: Pick<Block, 'kind' | 'url' | 'icon'>) => block.kind === 'post' && POST_PATH.test(block.url) && !!block.icon && SOURCE_ICONS.has(block.icon);

/** A Bluesky or Mastodon post taken out of a page: its author is the title, its handle the line under it. */
export const isSocialPiece = (block: Pick<Block, 'kind' | 'url' | 'icon'>) => block.kind === 'post' && /^https:/.test(block.url) && !!block.icon && PIECE_ICONS.has(block.icon);

/** Where a post block's post is served from. */
export const sourceUrl = (url: string) => `${url.replace(/\/?$/, '/')}source.json`;

/** How a fetched post is drawn: as the site's own note, as the saved post it likes or reposts, or not at all. */
export type SourceView = { type: 'note'; post: Post } | { type: 'saved'; snapshot: SocialSnapshot; mark: { icon: string; label: string } } | null;

export function sourceView(post: Post | null | undefined): SourceView {
	if (!post) return null;
	if (post.type === 'note' || post.type === 'reply') return { type: 'note', post };
	if (post.type !== 'like' && post.type !== 'repost') return null;
	const snapshot = postDetailSnapshots(post)[0];
	if (!snapshot) return null;
	return { type: 'saved', snapshot, mark: post.type === 'like' ? { icon: '⭐', label: 'liked' } : { icon: '🔁', label: 'reposted' } };
}

const cache = new Map<string, Promise<Post | null>>();

/** A post block's post, fetched once per page; null when it has none (an older build, or a post since deleted). */
export function fetchSourcePost(url: string, fetcher: typeof fetch = fetch): Promise<Post | null> {
	let found = cache.get(url);
	if (!found) {
		found = fetcher(sourceUrl(url))
			.then((response) => (response.ok ? (response.json() as Promise<Post>) : null))
			.catch(() => null);
		cache.set(url, found);
	}
	return found;
}

/**
 * The size a social post starts at: as wide as a post in a narrow column, and tall enough for its
 * words and picture. The canvas fades out whatever doesn't fit.
 */
export function socialSize(block: Pick<Block, 'excerpt' | 'image'>): { w: number; h: number } {
	const lines = Math.ceil((block.excerpt?.length ?? 80) / 42);
	const h = 96 + Math.min(lines, 10) * 22 + (block.image ? 200 : 0);
	return { w: 360, h: Math.round(Math.min(Math.max(h, 160), 560) / 20) * 20 };
}
