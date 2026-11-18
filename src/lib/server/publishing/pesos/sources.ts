/**
 * GitHub and Are.na activity imported as posts, next to the Mastodon and Bluesky feeds in
 * `providers.ts`. Both sources only read what anyone can see: public repositories, and Are.na
 * blocks marked public or closed, fetched without `ARENA_PAT`, so a private block cannot be
 * published even by mistake.
 */
import type { Properties } from '../document';
import { arenaDocument, isPublicOwn, type ArenaItem } from '../../../arena';
import type { Activity, GetJson, Page } from './providers';

const markdown = (text: string): Properties => (text.trim() ? {content:[text.trim()],'p3k-content-type':['text/markdown']} : {});
const after = (date: unknown, since?: string) => typeof date === 'string' && Number.isFinite(Date.parse(date)) && (!since || Date.parse(date) >= Date.parse(since));
/** A permalink-safe slug: letters, digits, `-` and `_`. */
export const slugPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
/** Markdown link text: brackets would end the label early. */
const label = (value: string) => value.replace(/([\\[\]])/g,'\\$1');

/** A release published in one of the user's own public repositories, as a note linking to it. */
export function githubRelease(event: any, user: string): Activity | undefined {
	const release = event?.payload?.release;
	const repo = typeof event?.repo?.name === 'string' ? event.repo.name : '';
	if (event?.type !== 'ReleaseEvent' || event.public !== true || event.payload.action !== 'published' || !release || release.draft) return;
	// Releases of other people's projects show up in the feed too; only the user's own count.
	if (repo.split('/')[0]?.toLowerCase() !== user.toLowerCase() || typeof release.html_url !== 'string' || !release.html_url.startsWith(`https://github.com/${repo}/releases/`)) return;
	const published = release.published_at ?? event.created_at;
	if (!after(published) || (typeof release.id !== 'number' && typeof release.id !== 'string')) return;
	const name = repo.split('/')[1];
	const title = String(release.name || release.tag_name || '').trim();
	const heading = title.toLowerCase().includes(name.toLowerCase()) ? title : `${name} ${title}`.trim();
	const body = typeof release.body === 'string' ? release.body.trim() : '';
	return {
		id:`github:release:${release.id}`,service:'github',kind:'post',url:release.html_url,published,
		slug:slugPart(`${name}-${release.tag_name ?? release.id}`),
		properties:markdown(`Released [${label(heading)}](${release.html_url})${body ? `\n\n${body}` : ''}`)
	};
}

/** A starred public repository, as a bookmark of it. */
export function githubStar(star: any): Activity | undefined {
	const repo = star?.repo;
	if (!repo || repo.private !== false || typeof repo.html_url !== 'string' || typeof repo.full_name !== 'string' || !after(star.starred_at)) return;
	return {
		id:`github:star:${repo.id}`,service:'github',kind:'bookmark',url:repo.html_url,target:repo.html_url,published:star.starred_at,
		slug:slugPart(repo.full_name.replace('/','-')),
		properties:{name:[repo.full_name],...markdown(typeof repo.description === 'string' ? repo.description : '')}
	};
}

/** Releases come from the public events feed, which keeps the last 90 days. */
export async function githubReleasePage(get: GetJson, user: string, headers: Record<string,string>, since?: string): Promise<Page> {
	const {data} = await get(`https://api.github.com/users/${encodeURIComponent(user)}/events/public?per_page=100`,headers);
	if (!Array.isArray(data)) throw new Error('Invalid GitHub events page');
	const releases = data.filter(event=>event?.type === 'ReleaseEvent');
	return {ids:releases.map(event=>`github:release:${event.payload?.release?.id}`),activities:releases.map(event=>githubRelease(event,user)).filter((a):a is Activity=>!!a && after(a.published,since))};
}

/** Stars, newest first; pages stop once they reach stars older than `since`. */
export async function githubStarPage(get: GetJson, user: string, headers: Record<string,string>, since?: string, cursor?: string): Promise<Page> {
	const url = new URL(`https://api.github.com/users/${encodeURIComponent(user)}/starred`);
	url.search = new URLSearchParams({per_page:'50',...(cursor ? {page:cursor} : {})}).toString();
	// This media type adds `starred_at` to each repository.
	const {data,link} = await get(url.href,{...headers,Accept:'application/vnd.github.star+json'});
	if (!Array.isArray(data)) throw new Error('Invalid GitHub stars page');
	const activities = data.map(githubStar).filter((a):a is Activity=>!!a);
	const recent = activities.filter(a=>after(a.published,since));
	const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
	return {ids:data.map(star=>`github:star:${star?.repo?.id}`),activities:recent,cursor:next && recent.length === activities.length ? new URL(next).searchParams.get('page') ?? undefined : undefined};
}

/**
 * A block the user made, as a bookmark: of the page it links to, or of the block itself for text and
 * images. Anything not marked public or closed is dropped, as the public search index does.
 */
export function arenaBlock(item: ArenaItem, user: string): Activity | undefined {
	if (item.type === 'Channel' || !isPublicOwn(item,user) || !after(item.created_at) || !/^\d+$/.test(String(item.id))) return;
	const document = arenaDocument(item);
	const source = typeof item.source?.url === 'string' && /^https?:\/\//.test(item.source.url) ? item.source.url : undefined;
	const text = item.type === 'Text' ? item.content?.markdown ?? item.content?.plain ?? '' : '';
	const description = item.description?.markdown ?? item.description?.plain ?? '';
	const properties: Properties = {name:[document.title],...markdown([text,description].filter(s=>s?.trim()).join('\n\n'))};
	const image = item.type === 'Image' ? item.image?.src : undefined;
	if (typeof image === 'string' && image.startsWith('https://')) properties.photo = [{url:image,alt:item.image?.alt_text ?? ''}];
	return {id:`arena:block:${item.id}`,service:'arena',kind:'bookmark',url:document.url,target:source ?? document.url,published:item.created_at!,slug:`arena-${item.id}`,properties};
}

/**
 * The newest blocks. Are.na's sort is only roughly by date, so this reads one large page and
 * filters by date here instead of paging back.
 */
export async function arenaPage(get: GetJson, user: string, since?: string): Promise<Page> {
	// No token: the guest API cannot return private blocks.
	const {data} = await get(`https://api.are.na/v3/users/${encodeURIComponent(user)}/contents?per=100&type=Block&sort=created_at_desc`);
	if (!Array.isArray(data?.data)) throw new Error('Invalid Are.na page');
	const items = data.data as ArenaItem[];
	return {ids:items.map(item=>`arena:block:${item.id}`),activities:items.map(item=>arenaBlock(item,user)).filter((a):a is Activity=>!!a && after(a.published,since))};
}
