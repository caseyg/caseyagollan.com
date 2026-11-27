/**
 * Are.na: the blocks and channels Casey made, and everything in Casey's own channels (which
 * includes blocks other people made that Casey connected). With `ARENA_PAT` private ones come
 * too; without it, only what anyone can see.
 *
 * A pass has two parts. First Casey's own contents, most recently changed first, stopping at the
 * last sync. Then each channel that changed, a page at a time, which is what says which channel a
 * block is in. The first pass, and one a week, lists everything, which is how removals are noticed.
 *
 * Only what Casey made and anyone can see is marked public; a block someone else made, or anything
 * private or in a private channel only, is for the owner.
 */
import { ARENA_USER, arenaDocument, isOwn, isVisible, type ArenaItem } from '../../../arena';
import { flat, getJson, iso, secret, wantsFull, webUrl } from './http';
import type { SourceDocument, SourcePlugin, SourceRecord, SyncContext, SyncStep } from '../types';

const API = 'https://api.are.na/v3';
const PAGE = 100;

interface Channel { slug: string; title: string }
interface Cursor { phase: 'items' | 'channels'; page: number; full: boolean; channels: Channel[]; ids: string[] }
type Page = { data?: ArenaRecord[]; meta?: { has_more_pages?: boolean } };
export type ArenaRecord = ArenaItem & { content?: { markdown?: string | null; plain?: string | null } | null; description?: { markdown?: string | null; plain?: string | null } | null; attachment?: { filename?: string | null; url?: string | null; content_type?: string | null } | null };

const channelUrl = (item: ArenaItem) => `https://www.are.na/${item.owner?.slug ?? ARENA_USER}/${item.slug ?? item.id}`;
const channelId = (slug: string) => `channel:${slug}`;

export function arenaSourceDocument(item: ArenaRecord): SourceDocument {
	const about = arenaDocument(item);
	const isPublic = isOwn(item) && isVisible(item);
	if (item.type === 'Channel') {
		return {
			source: 'arena', id: channelId(item.slug ?? String(item.id)), kind: 'channel', title: about.title, url: channelUrl(item), ...(about.text ? { text: about.text } : {}), summary: about.detail,
			tags: [], places: [], created: iso(item.created_at), updated: iso(item.updated_at), private: !isPublic, ...(typeof item.counts?.contents === 'number' ? { extra: { blocks: item.counts.contents } } : {})
		};
	}
	const open = `https://www.are.na/block/${item.id}`;
	const page = item.type === 'Link' || item.type === 'Embed' ? webUrl(item.source?.url) : undefined;
	const text = [item.content?.markdown ?? item.content?.plain, item.description?.markdown ?? item.description?.plain].map((part) => (typeof part === 'string' ? part.trim() : '')).filter(Boolean).join('\n\n');
	const site = flat(item.source?.provider?.name).replace(/^www\./, '');
	return {
		source: 'arena', id: String(item.id), kind: about.kind, title: about.title, url: page ?? open, ...(page ? { openUrl: open } : {}), ...(text ? { text } : {}),
		...(site ? { site } : {}), ...(flat(item.embed?.author_name) ? { author: flat(item.embed?.author_name) } : {}), ...(webUrl(item.image?.src ?? item.image?.small?.src) ? { image: webUrl(item.image?.src ?? item.image?.small?.src) } : {}),
		tags: [], places: [], created: iso(item.created_at), updated: iso(item.updated_at), private: !isPublic,
		extra: { ...(item.user?.slug && item.user.slug !== ARENA_USER ? { addedBy: item.user.slug } : {}), ...(flat(item.attachment?.filename) ? { file: flat(item.attachment?.filename) } : {}), ...(webUrl(item.source?.url) && !page ? { sourceUrl: webUrl(item.source?.url)! } : {}) }
	};
}

const available = (item: ArenaItem) => !item.state || item.state === 'available';

export const arena: SourcePlugin = {
	id: 'arena',
	name: 'Are.na',
	icon: '◼︎',
	// Public channels need no token, so Are.na is always there to read.
	configured: () => true,
	async sync(context: SyncContext, state): Promise<SyncStep> {
		const token = secret(context.env, 'ARENA_PAT');
		const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
		const cursor = (state.cursor as Cursor | undefined) ?? { phase: 'items', page: 1, full: wantsFull(state, context.now()), channels: [], ids: [] };

		if (cursor.phase === 'items') {
			const { data = [], meta } = await getJson<Page>(context, 'Are.na', `${API}/users/${ARENA_USER}/contents?per=${PAGE}&page=${cursor.page}&sort=updated_at_desc`, headers);
			const since = cursor.full ? 0 : Date.parse(state.since ?? '') || 0;
			const fresh = data.filter((item) => (Date.parse(item.updated_at ?? '') || Infinity) >= since);
			const documents: SourceRecord[] = fresh.filter((item) => available(item) && isOwn(item)).map((item) => ({ document: arenaSourceDocument(item), raw: item, keepPlaces: true }));
			const channels = [...cursor.channels, ...fresh.filter((item) => item.type === 'Channel' && item.slug && item.owner?.slug === ARENA_USER && available(item)).map((item) => ({ slug: item.slug!, title: item.title?.trim() || item.slug! }))];
			const more = !!meta?.has_more_pages && data.length > 0 && fresh.length === data.length;
			if (more) return { documents, cursor: { ...cursor, page: cursor.page + 1, channels }, done: false };
			return channels.length ? { documents, cursor: { ...cursor, phase: 'channels', page: 1, channels, ids: [] }, done: false } : { documents, done: true, complete: cursor.full };
		}

		const [channel, ...rest] = cursor.channels;
		const { data = [], meta } = await getJson<Page>(context, 'Are.na', `${API}/channels/${encodeURIComponent(channel.slug)}/contents?per=${PAGE}&page=${cursor.page}`, headers);
		const blocks = data.filter((item) => item.type !== 'Channel' && available(item));
		const documents: SourceRecord[] = blocks.map((item) => ({ document: arenaSourceDocument(item), raw: item, keepPlaces: true }));
		const ids = [...cursor.ids, ...blocks.map((item) => String(item.id))];
		if (meta?.has_more_pages && data.length) return { documents, cursor: { ...cursor, page: cursor.page + 1, ids }, done: false };
		const places = [{ place: channel.title, ids }];
		return rest.length ? { documents, places, cursor: { ...cursor, page: 1, channels: rest, ids: [] }, done: false } : { documents, places, done: true, complete: cursor.full };
	}
};
