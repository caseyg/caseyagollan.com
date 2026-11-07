import { flattenSocialSnapshots } from '../src/lib/social-snapshots';
import type { Post } from '../src/lib/posts-types';

export const uniqueLabels = (values: unknown[]): string[] => [...new Set(values
	.filter((value): value is string => typeof value === 'string')
	.map(value => value.trim()).filter(Boolean))];

/** Keep catalog labels intact: commas can be part of a genre or subject name. */
export function bookTags(details: { genre?: unknown[]; ddc?: { wording?: unknown[] } }): string[] {
	return uniqueLabels([...(details.genre ?? []), ...(details.ddc?.wording ?? [])]);
}

export function socialHandle(value: string): string | undefined {
	try {
		const url = new URL(value);
		if (url.hostname === 'bsky.app') {
			const profile = url.pathname.match(/^\/profile\/([^/]+)/)?.[1];
			if (profile === 'did:plc:s3fw2giksymfvruno3tvem4k') return '@caseyagollan.com';
			return profile && !profile.startsWith('did:') ? `@${profile}` : undefined;
		}
		const user = url.pathname.match(/^\/@([^/]+)\/\d+/)?.[1]
			?? url.pathname.match(/^\/users\/([^/]+)\/statuses\//)?.[1];
		return user ? `@${user}@${url.hostname}` : undefined;
	} catch { return undefined; }
}

export function postAuthors(post: Post): string[] {
	const targets = ['like-of', 'repost-of', 'in-reply-to'].flatMap(key => post.properties?.[key] ?? []);
	return uniqueLabels([
		'Casey Gollan',
		...(post.syndication ?? []).map(socialHandle),
		...targets.filter((value): value is string => typeof value === 'string').map(socialHandle),
		...flattenSocialSnapshots(post.socialSnapshots ?? []).map(snapshot => `@${snapshot.author.handle.replace(/^@/, '')}`)
	]);
}

export function yearFilter(value: unknown): string[] {
	const year = String(value ?? '').match(/^\d{4}(?=$|\D)/)?.[0];
	return year ? [year] : [];
}

export function bookAuthors(details: { primaryauthor?: string; authors?: { lf?: string; role?: string }[] }): string[] {
	return uniqueLabels([details.primaryauthor, ...(details.authors ?? [])
		.filter(author => author?.role === 'Author').map(author => author.lf)]);
}
