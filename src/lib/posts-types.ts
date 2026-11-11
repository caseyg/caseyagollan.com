import type { SocialSnapshot } from './social-snapshots';
// Client-safe post types and constants (no Node.js imports)

export interface MediaItem {
	url: string;
	alt?: string;
	type?: string;
}

export interface Post {
	slug: string;
	type: 'note' | 'article' | 'bookmark' | 'photo' | 'video' | 'reply' | 'media' | 'like' | 'repost' | 'event' | 'review' | 'itinerary' | 'food' | 'drink';
	date: string;
	updated?: string;
	syndicationTargets?: string[];
	title?: string;
	bookmarkOf?: string;
	inReplyTo?: string;
	summary?: string;
	category?: string | string[];
	content: string;
	contentFormat?: 'text' | 'html' | 'markdown';
	postStatus?: string;
	deleted?: boolean;
	visibility?: string;
	draft?: boolean;
	syndication?: string[];
	photo?: MediaItem[];
	video?: MediaItem[];
	microformatType?: string;
	channel?: string;
	socialSnapshots?: SocialSnapshot[];
	properties?: Record<string, unknown[]>;
	indexActivities?: { type: 'like' | 'repost'; date: string; permalink: string; target?: string; network?: string; author?: string; dateSource?: string }[];
	/** Presentation-only conversation members; original records remain intact. */
	indexThreadPosts?: Post[];
	filePath: string;
}

export const POST_TYPES = ['note', 'article', 'bookmark', 'photo', 'video', 'reply', 'media', 'like', 'repost', 'event', 'review', 'itinerary', 'food', 'drink'] as const;
export const POST_TYPE_PLURALS: Record<string, string> = {
	note: 'notes',
	article: 'articles',
	bookmark: 'bookmarks',
	photo: 'photos',
	video: 'videos',
	reply: 'replies',
	media: 'media',
	like: 'likes',
	repost: 'reposts',
	event: 'events',
	review: 'reviews',
	itinerary: 'itineraries',
	food: 'foods',
	drink: 'drinks'
};

export function getPostPermalink(post: { date: string; slug: string }): string {
	// Extract date components from ISO string directly to preserve local date
	// e.g., "2025-11-29T19:33:16-05:00" -> year=2025, month=11, day=29
	const match = post.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (match) {
		const [, year, month, day] = match;
		return `/${year}/${month}/${day}/${post.slug}/`;
	}
	// Fallback to Date parsing if format doesn't match
	const date = new Date(post.date);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `/${year}/${month}/${day}/${post.slug}/`;
}

/** Normalize saved target/article URLs without fetching or discarding meaningful query parameters. */
export function indexContentUrl(value: string): string | undefined {
 try {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid','gclid'].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.href;
 } catch { return; }
}

function targetSnapshot(snapshot: SocialSnapshot, target: string): boolean {
 return indexContentUrl(snapshot.url) === target || (!!snapshot.sourceUrl && indexContentUrl(snapshot.sourceUrl) === target);
}

/** Presentation only: group reactions by exact targets or saved shared-article URLs. */
export function rollupIndexPosts(posts: Post[]): Post[] {
 const parents = posts.map((_,i) => i);
 const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
 const keys = new Map<string,number>();
 for (const [i,post] of posts.entries()) {
  if (post.indexActivities || post.indexThreadPosts) continue; // Already rolled up by a caller.
  const key = post.type === 'like' ? 'like-of' : post.type === 'repost' ? 'repost-of' : '';
  const targets = post.properties?.[key];
  if (!key || targets?.length !== 1 || typeof targets[0] !== 'string') continue;
  const target = indexContentUrl(targets[0]);
  if (!target) continue;
  // Keep the site's own commentary/media separate; remote captions remain on their permalinks.
  const signature = JSON.stringify([post.content.trim(),post.title,post.summary,post.photo,post.video]);
  const identities = new Set([`target:${target}`]);
  for (const snapshot of post.socialSnapshots ?? []) {
   if (!targetSnapshot(snapshot,target)) continue;
   const canonical = indexContentUrl(snapshot.url);
   if (canonical) identities.add(`target:${canonical}`);
   const alias = snapshot.sourceUrl && indexContentUrl(snapshot.sourceUrl);
   if (alias) identities.add(`target:${alias}`);
   const article = snapshot.preview && indexContentUrl(snapshot.preview.url);
   if (article && new URL(article).pathname !== '/') identities.add(`article:${article}`);
  }
  for (const identity of identities) {
   const full = signature + identity;
   const previous = keys.get(full);
   if (previous !== undefined) parents[root(i)] = root(previous);
   keys.set(full,i);
  }
 }
 const groups = new Map<number,Post[]>();
 for (const [i,post] of posts.entries()) {
  const id = root(i);
  const group = groups.get(id) ?? [];
  group.push(post);
  groups.set(id,group);
 }
 const result: Post[] = [];
 for (const group of groups.values()) {
  if (group.length === 1) { result.push(group[0]); continue; }
  const ordered = [...group].sort((a,b) => Date.parse(b.date)-Date.parse(a.date));
  const primary = ordered[0];
  const snapshots = ordered.flatMap(p => (p.socialSnapshots ?? []).filter(s => targetSnapshot(s,indexContentUrl(String(p.properties?.[p.type === 'like' ? 'like-of' : 'repost-of']?.[0]))!)));
  const snapshot = snapshots.find(s => s.preview?.image) ?? snapshots.find(s => s.preview) ?? snapshots[0];
  const activities = group.map(p => {
   const target = String(p.properties?.[p.type === 'like' ? 'like-of' : 'repost-of']?.[0]);
   const saved = p.socialSnapshots?.find(s => targetSnapshot(s,indexContentUrl(target)!));
   return {type:p.type as 'like' | 'repost',date:p.date,permalink:getPostPermalink(p),target,
    author:saved?.author.name,
    dateSource:typeof p.properties?.['pesos-date-source']?.[0] === 'string' ? p.properties['pesos-date-source'][0] : undefined,
    network:saved ? saved.platform === 'bluesky' ? 'Bluesky' : 'Mastodon' : new URL(target).hostname === 'bsky.app' ? 'Bluesky' : new URL(target).hostname};
  }).sort((a,b) => a.type.localeCompare(b.type) || Date.parse(b.date)-Date.parse(a.date));
  const properties = {...primary.properties};
  for (const key of ['like-of','repost-of']) {
   const values = [...new Set(group.flatMap(p => p.properties?.[key] ?? []))];
   if (values.length) properties[key] = values;
  }
  result.push({...primary,properties,socialSnapshots:snapshot ? [snapshot] : [],indexActivities:activities,
   category:[...new Set(group.flatMap(p => p.category ? Array.isArray(p.category) ? p.category : [p.category] : []))]});
 }
 return rollupThreadPosts(result).sort((a,b) => Date.parse(b.date)-Date.parse(a.date));
}

/** Group only saved conversation relationships, never proximity in time or shared authors. */
function rollupThreadPosts(posts: Post[]): Post[] {
 const parents = posts.map((_, i) => i);
 const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
 const seen = new Map<string, number>();
 for (const [i, post] of posts.entries()) {
  if (post.indexThreadPosts || !['like','repost','reply'].includes(post.type)) continue;
  if (post.type !== 'reply' && (post.content.trim() || post.title || post.summary || post.photo?.length || post.video?.length)) continue;
  const identities = new Set<string>();
  const add = (value: unknown) => { if (typeof value === 'string') { const url = indexContentUrl(value); if (url) identities.add(url); } };
  const targets = [...(post.properties?.['like-of'] ?? []), ...(post.properties?.['repost-of'] ?? []),
   ...(post.properties?.['in-reply-to'] ?? []), ...(post.inReplyTo ? [post.inReplyTo] : [])];
  if (post.type !== 'reply' && !post.indexActivities && targets.length !== 1) continue;
  targets.forEach(add);
  if (post.type === 'reply') { add(`https://caseyagollan.com${getPostPermalink(post)}`); post.syndication?.forEach(add); }
  for (const snapshot of post.socialSnapshots ?? []) {
   if (!targets.some(target => typeof target === 'string' && targetSnapshot(snapshot, indexContentUrl(target) ?? ''))) continue;
   add(snapshot.url); add(snapshot.sourceUrl);
   if (snapshot.thread) { add(snapshot.thread.post); add(snapshot.thread.root); add(snapshot.thread.parent); }
  }
  for (const identity of identities) {
   const previous = seen.get(identity);
   if (previous !== undefined) parents[root(i)] = root(previous);
   seen.set(identity, i);
  }
 }
 const groups = new Map<number, Post[]>();
 posts.forEach((post, i) => { const id = root(i); const group = groups.get(id) ?? []; group.push(post); groups.set(id, group); });
 return [...groups.values()].map(group => {
  if (group.length === 1) return group[0];
  const latest = [...group].sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
  const published = (post: Post) => post.type === 'reply' ? Date.parse(post.date) : Date.parse(post.socialSnapshots?.[0]?.published ?? post.date);
  const members = [...group].sort((a,b) => published(a)-published(b) || getPostPermalink(a).localeCompare(getPostPermalink(b)));
  return {...latest,indexThreadPosts:members};
 });
}

export function getPostsByDay(posts: Post[]): Map<string, Post[]> {
	const byDay = new Map<string, Post[]>();

	for (const post of rollupIndexPosts(posts)) {
		// Extract date from ISO string directly to preserve local date
		const match = post.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
		const dateKey = match ? `${match[1]}-${match[2]}-${match[3]}` : post.date.slice(0, 10);

		if (!byDay.has(dateKey)) {
			byDay.set(dateKey, []);
		}
		byDay.get(dateKey)!.push(post);
	}

	return byDay;
}
