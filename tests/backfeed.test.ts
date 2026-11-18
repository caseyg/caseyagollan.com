import { describe, expect, test } from 'bun:test';
import { combineResponses, countMentions, nativeId, NATIVE_ID_BASE, replyKey, threadReplies, type StoredMention } from '../src/lib/webmentions';
import { readBackfeed, readTarget, refreshAfter, socialCopy, syncBackfeed, type BackfeedTarget } from '../src/lib/server/backfeed';
import { readCounts, readMentions } from '../src/lib/server/webmentions';

function bucket() {
	const objects = new Map<string, string>();
	return {
		objects,
		async get(key: string) {
			const value = objects.get(key);
			return value === undefined ? null : { json: async () => JSON.parse(value) };
		},
		async put(key: string, value: string) {
			objects.set(key, value);
		}
	} as unknown as R2Bucket & { objects: Map<string, string> };
}

const DID = 'did:plc:s3fw2giksymfvruno3tvem4k';
const PATH = '/2026/07/11/a-post/';
const target: BackfeedTarget = {
	path: PATH,
	published: '2026-07-11T10:00:00-04:00',
	syndication: ['https://social.coop/@caseyg/100', 'https://social.coop/@caseyg/101', 'https://bsky.app/profile/caseyagollan.com/post/3root']
};

const account = (name: string, host = 'mastodon.example') => ({ id: name, username: name, display_name: name.toUpperCase(), url: `https://${host}/@${name}`, avatar_static: `https://${host}/${name}.png` });
const status = (id: string, parent: string, who: ReturnType<typeof account>, url = `${who.url}/${id}`, visibility = 'public') => ({
	id, in_reply_to_id: parent, url, uri: url, visibility, created_at: `2026-07-11T1${id.length}:00:00Z`, content: `<p>reply ${id}</p>`, account: who
});
const casey = { ...account('caseyg', 'social.coop') };
const author = (handle: string) => ({ did: `did:plc:${handle}`, handle: `${handle}.bsky.social`, displayName: handle.toUpperCase(), avatar: `https://cdn.example/${handle}.jpg` });
const bpost = (rkey: string, who: ReturnType<typeof author> | { did: string; handle: string }, text: string) => ({
	uri: `at://${who.did}/app.bsky.feed.post/${rkey}`, author: who, record: { text, createdAt: '2026-07-11T15:00:00Z' }, labels: []
});
const node = (post: object, replies: object[] = []) => ({ $type: 'app.bsky.feed.defs#threadViewPost', post, replies });
const me = { did: DID, handle: 'caseyagollan.com' };

/** Mastodon and Bluesky as the backfeed sees them, for the target above. */
function networks(seen: string[] = []) {
	return (async (input: string | URL | Request) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		seen.push(url.href);
		const ok = (data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { headers });
		if (url.pathname === '/backfeed.json') return ok({ version: 1, posts: [target] });
		if (url.pathname.endsWith('.resolveHandle')) return ok({ did: DID });
		if (url.pathname === '/api/v1/statuses/100/context') {
			const ann = account('ann');
			return ok({ descendants: [
				// Casey's own next thread post is the post, not a reply; its replies move to the top.
				status('101', '100', casey, 'https://social.coop/@caseyg/101'),
				status('200', '100', ann),
				status('201', '200', casey, 'https://social.coop/@caseyg/201'),
				status('202', '201', ann),
				status('203', '101', account('bo')),
				status('204', '100', account('cy'), undefined, 'private')
			] });
		}
		if (url.pathname === '/api/v1/statuses/100/favourited_by') {
			if (url.searchParams.get('max_id')) return ok([account('page2')]);
			return ok([account('ann'), account('bo')], { link: '<https://social.coop/api/v1/statuses/100/favourited_by?limit=80&max_id=9>; rel="next"' });
		}
		if (url.pathname === '/api/v1/statuses/100/reblogged_by') return ok([account('bo')]);
		if (url.pathname.endsWith('/app.bsky.feed.getPostThread')) {
			return ok({ thread: node(bpost('3root', me, 'root'), [
				node(bpost('3dee', author('dee'), 'first!'), [node(bpost('3me', me, 'thanks dee'), [node(bpost('3eve', author('eve'), 'deep'))])]),
				node({ ...bpost('3spam', author('spam'), 'buy now'), labels: [{ val: '!hide' }] }),
				{ $type: 'app.bsky.feed.defs#blockedPost', uri: 'at://x' }
			]) });
		}
		if (url.pathname.endsWith('/app.bsky.feed.getLikes')) return ok({ likes: [{ actor: author('dee'), createdAt: '2026-07-11T16:00:00Z' }] });
		if (url.pathname.endsWith('/app.bsky.feed.getRepostedBy')) return ok({ repostedBy: [author('fay')] });
		return new Response('not found', { status: 404 });
	}) as unknown as typeof fetch;
}

describe('social copies', () => {
	test('recognises only Casey’s own Mastodon and Bluesky posts', () => {
		expect(socialCopy('https://social.coop/users/caseyg/statuses/123')).toMatchObject({ network: 'mastodon', id: '123', url: 'https://social.coop/@caseyg/123' });
		expect(socialCopy('https://social.coop/@someone/123')).toBeNull();
		expect(socialCopy('https://social.coop/web/statuses/123')).toBeNull();
		expect(socialCopy('https://bsky.app/profile/caseyagollan.com/post/3abc')).toMatchObject({ network: 'bluesky', rkey: '3abc' });
		expect(socialCopy(`https://bsky.app/profile/${DID}/post/3abc`, DID)).toMatchObject({ network: 'bluesky' });
		expect(socialCopy('https://bsky.app/profile/did:plc:other/post/3abc', DID)).toBeNull();
		expect(socialCopy('https://bsky.app/profile/someone.bsky.social/post/3abc')).toBeNull();
	});

	test('reads new posts often and old ones weekly', () => {
		const now = Date.parse('2026-07-20T00:00:00Z');
		expect(refreshAfter('2026-07-19T12:00:00Z', now)).toBe(10 * 60_000);
		expect(refreshAfter('2026-07-10T00:00:00Z', now)).toBe(60 * 60_000);
		expect(refreshAfter('2020-01-01T00:00:00Z', now)).toBe(7 * 24 * 60 * 60_000);
	});
});

describe('reading a post’s responses', () => {
	test('nests replies, skips Casey’s own thread posts, private and hidden replies', async () => {
		const responses = await readTarget(target, DID, networks());
		const replies = responses.filter((r) => r.kind === 'reply');
		const urls = replies.map((r) => r.url);
		expect(urls).not.toContain('https://social.coop/@caseyg/101');
		expect(urls).not.toContain('https://mastodon.example/@cy/204');
		expect(urls.some((url) => url.includes('3spam'))).toBe(false);
		const byUrl = new Map(replies.map((r) => [r.url, r]));
		expect(byUrl.get('https://mastodon.example/@ann/200')?.parent).toBeUndefined();
		expect(byUrl.get('https://social.coop/@caseyg/201')?.parent).toBe('https://mastodon.example/@ann/200');
		expect(byUrl.get('https://mastodon.example/@ann/202')?.parent).toBe('https://social.coop/@caseyg/201');
		// A reply to Casey's second thread post is a reply to the post.
		expect(byUrl.get('https://mastodon.example/@bo/203')?.parent).toBeUndefined();
		const eve = replies.find((r) => r.url.endsWith('/3eve'))!;
		expect(eve.parent).toBe('https://bsky.app/profile/caseyagollan.com/post/3me');
		expect(eve).toMatchObject({ network: 'bluesky', author: { name: 'EVE', url: 'https://bsky.app/profile/eve.bsky.social' } });
		expect(eve.id).toBe(nativeId(eve.url));
		expect(eve.id).toBeGreaterThanOrEqual(NATIVE_ID_BASE);

		expect(responses.filter((r) => r.kind === 'like').map((r) => r.author.name).sort()).toEqual(['ANN', 'BO', 'DEE', 'PAGE2']);
		expect(responses.filter((r) => r.kind === 'repost').map((r) => r.author.name).sort()).toEqual(['BO', 'FAY']);
	});

	test('the cron reads due posts, stores them, and waits before reading again', async () => {
		const store = bucket();
		const seen: string[] = [];
		const env = { PUBLISHING_STATE: store };
		const now = () => new Date('2026-07-11T18:00:00Z');
		const first = await syncBackfeed(env, networks(seen), now);
		expect(first).toMatchObject({ read: 1, failed: 0, due: 1 });
		expect(seen[0]).toBe('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=caseyagollan.com');
		const stored = JSON.parse(store.objects.get(`webmentions/backfeed/posts/${encodeURIComponent(PATH)}.json`)!);
		expect(stored.length).toBe(first.responses);
		expect(JSON.parse(store.objects.get('webmentions/backfeed/state.json')!)).toMatchObject({ did: DID, checked: { [PATH]: now().toISOString() } });

		const again = await syncBackfeed(env, networks(), () => new Date('2026-07-11T18:05:00Z'));
		expect(again).toMatchObject({ read: 0, due: 0 });
		expect((await syncBackfeed(env, networks(), () => new Date('2026-07-11T18:11:00Z'))).read).toBe(1);
	});

	test('a post page reads live until the bucket has been read once', async () => {
		const live = await readBackfeed({ PUBLISHING_STATE: bucket() }, [PATH], networks());
		expect(live.some((r) => r.url.endsWith('/3eve'))).toBe(true);
		expect(await readBackfeed({ PUBLISHING_STATE: bucket() }, ['/2020/01/01/other/'], networks())).toEqual([]);
	});
});

describe('combining with Webmentions', () => {
	const wm = (id: number, kind: StoredMention['kind'], url: string, authorUrl: string): StoredMention => ({
		id, kind, target: PATH, url, source: `https://brid.gy/x/${id}`, author: { name: 'Bridgy copy', url: authorUrl, photo: '' }
	});

	test('drops Bridgy copies, keeping their ids for moderation', async () => {
		const native = await readTarget(target, DID, networks());
		const dee = native.find((r) => r.url.endsWith('/3dee'))!;
		const webmentions = [
			wm(7, 'reply', 'https://bsky.app/profile/did:plc:dee/post/3dee', 'https://bsky.app/profile/dee.bsky.social'),
			wm(8, 'like', `https://bsky.app/profile/caseyagollan.com/post/3root#liked_by_did:plc:dee`, 'https://bsky.app/profile/dee.bsky.social'),
			wm(9, 'mention', 'https://blog.example/post', 'https://blog.example/')
		];
		const all = combineResponses(webmentions, native);
		expect(all.length).toBe(native.length + 1);
		expect(all.find((r) => r.url === dee.url)?.id).toBe(7);
		expect(all.filter((r) => r.kind === 'like' && r.author.url === 'https://bsky.app/profile/dee.bsky.social').map((r) => r.id)).toEqual([8]);
		expect(all.some((r) => r.id === 9)).toBe(true);
	});

	test('post pages and count chips include both', async () => {
		const store = bucket();
		store.objects.set('webmentions/state.json', JSON.stringify({ sinceId: 1, syncedAt: '', total: 1 }));
		store.objects.set(`webmentions/posts/${encodeURIComponent(PATH)}.json`, JSON.stringify([wm(5, 'like', 'https://social.coop/@caseyg/100#favorited-by-ann', 'https://mastodon.example/@ann')]));
		store.objects.set('webmentions/index.json', JSON.stringify({ [PATH]: [{ id: 5, kind: 'like', author: { name: '', url: 'https://mastodon.example/@ann', photo: '' }, source: 'https://brid.gy/x/5' }] }));
		await syncBackfeed({ PUBLISHING_STATE: store }, networks(), () => new Date('2026-07-11T18:00:00Z'));
		const { mentions } = await readMentions({ PUBLISHING_STATE: store }, [PATH], networks());
		expect(mentions.filter((m) => m.kind === 'like' && m.author.url === 'https://mastodon.example/@ann').map((m) => m.id)).toEqual([5]);
		const counts = await readCounts(store);
		expect(counts?.[PATH]).toEqual(countMentions(mentions));
		expect(counts?.[PATH].like).toBe(4);
	});
});

describe('threads', () => {
	const r = (url: string, published: string, parent?: string) => ({ id: nativeId(url), kind: 'reply', target: PATH, url, source: url, author: { name: url, url: '', photo: '' }, published, ...(parent ? { parent } : {}) }) as StoredMention;

	test('nests replies under their parents, oldest first, orphans at the top', () => {
		const a = r('https://x.example/a', '2026-01-01T01:00:00Z');
		const b = r('https://x.example/b', '2026-01-01T02:00:00Z', a.url);
		const c = r('https://x.example/c', '2026-01-01T00:30:00Z');
		const orphan = r('https://x.example/d', '2026-01-01T03:00:00Z', 'https://x.example/gone');
		const tree = threadReplies([orphan, b, a, c]);
		expect(tree.map((n) => n.reply.url)).toEqual([c.url, a.url, orphan.url]);
		expect(tree[1].replies.map((n) => n.reply.url)).toEqual([b.url]);
	});

	test('treats Bluesky handle and DID addresses of a post as the same reply', () => {
		expect(replyKey('https://bsky.app/profile/did:plc:dee/post/3dee')).toBe(replyKey('https://bsky.app/profile/dee.bsky.social/post/3dee'));
		const a = r('https://bsky.app/profile/dee.bsky.social/post/3a', '2026-01-01T01:00:00Z');
		const b = r('https://bsky.app/profile/eve.bsky.social/post/3b', '2026-01-01T02:00:00Z', 'https://bsky.app/profile/did:plc:dee/post/3a');
		expect(threadReplies([a, b])[0].replies[0].reply.url).toBe(b.url);
	});

	test('a loop of parents still shows every reply', () => {
		const a = r('https://x.example/a', '2026-01-01T01:00:00Z', 'https://x.example/b');
		const b = r('https://x.example/b', '2026-01-01T02:00:00Z', 'https://x.example/a');
		const tree = threadReplies([a, b]);
		const count = (nodes: typeof tree): number => nodes.reduce((sum, n) => sum + 1 + count(n.replies), 0);
		expect(count(tree)).toBe(2);
	});
});
