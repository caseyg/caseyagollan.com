import { ownerHint } from '$lib/owner';
import { emptyModeration, isHidden, type MentionCounts, type MentionModeration, type ModerationAction, type StoredMention } from '$lib/webmentions';

/** A mention as a page shows it; `hidden` only ever reaches the owner. */
export type ShownMention = StoredMention & { hidden?: boolean };

/**
 * Who is looking. `demo` lets moderation be tried where sign-in is off, such as branch
 * previews (`?owner=demo`); its changes stay on the page.
 */
export type MentionsMode = 'visitor' | 'owner' | 'demo';

export interface MentionsSession {
	mentions: ShownMention[];
	mode: MentionsMode;
	/** What the owner has hidden; empty for visitors. */
	moderation: MentionModeration;
	moderate: (change: ModerationAction) => Promise<void>;
}

function demoRequested(): boolean {
	return location.hostname !== 'caseyagollan.com' && new URLSearchParams(location.search).get('owner') === 'demo';
}

/** Loads a post's mentions from the site's own copy, with moderation for the owner. */
export async function loadMentions(paths: string[], fetcher: typeof fetch = fetch): Promise<MentionsSession> {
	const query = new URLSearchParams(paths.map((path) => ['target', path]));
	if (ownerHint()) query.set('owner', '');
	const response = await fetcher(`/api/webmentions?${query}`, { credentials: 'same-origin' });
	if (!response.ok) throw new Error(`Webmentions unavailable (${response.status})`);
	const data = (await response.json()) as { mentions?: ShownMention[]; owner?: boolean; csrf?: string; moderation?: MentionModeration };
	const mentions = Array.isArray(data.mentions) ? data.mentions : [];

	if (data.owner && data.csrf) {
		const csrf = data.csrf;
		return {
			mentions,
			mode: 'owner',
			moderation: data.moderation ?? emptyModeration(),
			async moderate(change) {
				const saved = await fetcher('/api/webmentions', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
					body: JSON.stringify(change)
				});
				const body = (await saved.json().catch(() => ({}))) as { error?: string };
				if (!saved.ok) throw new Error(body.error ?? 'That change wasn’t saved.');
			}
		};
	}
	return { mentions, mode: demoRequested() ? 'demo' : 'visitor', moderation: emptyModeration(), async moderate() {} };
}

/** Marks which mentions a moderation hides, so a change shows before the server answers. */
export function remark(mentions: ShownMention[], moderation: MentionModeration): ShownMention[] {
	return mentions.map((mention) => ({ ...mention, hidden: isHidden(mention, moderation) }));
}

let counts: Promise<Record<string, MentionCounts> | null> | undefined;

/**
 * Every post's counts in one request per page load, shared by all the chips in a feed.
 * Null until the site has its own copy; each chip then asks webmention.io (`liveCounts`).
 */
export function mentionCounts(fetcher: typeof fetch = fetch): Promise<Record<string, MentionCounts> | null> {
	counts ??= fetcher('/api/webmentions?counts')
		.then(async (response) => (response.ok ? (((await response.json()) as { counts?: Record<string, MentionCounts> | null }).counts ?? null) : null))
		.catch(() => null);
	return counts;
}

/** One post's counts from webmention.io, for pages served before the site has its own copy. */
export async function liveCounts(path: string, fetcher: typeof fetch = fetch): Promise<MentionCounts | null> {
	try {
		const response = await fetcher(`https://webmention.io/api/count.json?target=${encodeURIComponent(`https://caseyagollan.com${path}`)}`);
		if (!response.ok) return null;
		const data = (await response.json()) as { type?: Partial<Record<'like' | 'repost' | 'reply' | 'mention', number>> };
		return { like: data.type?.like ?? 0, repost: data.type?.repost ?? 0, reply: (data.type?.reply ?? 0) + (data.type?.mention ?? 0) };
	} catch {
		return null;
	}
}
