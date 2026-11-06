import { parse } from 'yaml';
import type { Post, MediaItem } from '../posts-types';

function normalizeMedia(
	value: unknown,
	altFallbacks?: unknown
): MediaItem[] | undefined {
	if (!value) return undefined;
	const items = Array.isArray(value) ? value : [value];
	const altList = Array.isArray(altFallbacks) ? altFallbacks : [];

	const normalized = items
		.map((item, i): MediaItem | null => {
			if (typeof item === 'string') {
				return { url: item, alt: typeof altList[i] === 'string' ? altList[i] : undefined };
			}
			if (item && typeof item === 'object' && (typeof (item as any).url === 'string' || typeof (item as any).value === 'string')) {
				const m = item as Record<string, unknown>;
				return {
					url: (m.url ?? m.value) as string,
					alt:
						typeof m.alt === 'string'
							? m.alt
							: typeof altList[i] === 'string'
								? (altList[i] as string)
								: undefined,
					type: typeof m.type === 'string' ? m.type : undefined
				};
			}
			return null;
		})
		.filter((m): m is MediaItem => m !== null);

	return normalized.length > 0 ? normalized : undefined;
}

// Mapping from plural folder names to singular type names
export const PLURAL_TO_SINGULAR: Record<string, Post['type']> = {
	notes: 'note',
	articles: 'article',
	bookmarks: 'bookmark',
	photos: 'photo',
	videos: 'video',
	replies: 'reply',
	media: 'media'
};

export function parsePost(fileContent: string, type: string, file: string): Post {
	const frontmatter = fileContent.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	const data = frontmatter ? (parse(frontmatter[1]) ?? {}) : {};
	const content = frontmatter ? fileContent.slice(frontmatter[0].length) : fileContent;

	// Remove .md extension and strip date prefix (YYYY-MM-DD-) from slug
	const slug = file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

	// YAML's core schema preserves ISO timestamps as strings, including their local timezone.
	const dateStr = typeof data.date === 'string' ? data.date : '';
	const first = (value: unknown) => Array.isArray(value) ? value[0] : value;

	return {
		slug,
		type: PLURAL_TO_SINGULAR[type],
		date: dateStr,
		title: data.title,
		bookmarkOf: data.bookmarkOf,
		inReplyTo: data.inReplyTo,
		summary: data.summary,
		category: data.category,
		content,
		contentFormat: data._micropubContentFormat ?? 'markdown',
		postStatus: data['post-status'] === undefined ? undefined : String(first(data['post-status'])),
		deleted: data.deleted === undefined ? false : ![false, 'false'].includes(first(data.deleted) as boolean | string),
		visibility: data.visibility === undefined ? undefined : String(first(data.visibility)),
		draft: data.draft === true,
		syndication: data.syndication,
		photo: normalizeMedia(data.photo, data['mp-photo-alt']),
		video: normalizeMedia(data.video),
		filePath: `${type}/${file}`
	};
}

export function isPublicPost(post: Post): boolean {
	return !post.deleted && (post.postStatus === undefined || post.postStatus === 'published') &&
		(post.visibility === undefined || post.visibility === 'public');
}
