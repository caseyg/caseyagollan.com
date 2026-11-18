import { describe, expect, test } from 'bun:test';
import { applyModeration, authorKey, countMentions, emptyModeration, groupMentions, isHidden, normalizeMention, parseModerationAction, targetPath } from '../src/lib/webmentions';
import { postPaths, publicMention, readCounts, readMentions, readModeration, sanitizeMentionHtml, syncWebmentions, writeModeration } from '../src/lib/server/webmentions';

/** An in-memory stand-in for the R2 bucket's get and put. */
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

const entry = (id: number, property: string, target: string, extra: Record<string, unknown> = {}) => ({
	type: 'entry',
	'wm-id': id,
	'wm-property': property,
	'wm-target': target,
	'wm-source': `https://brid.gy/comment/mastodon/${id}`,
	'wm-received': '2025-09-30T19:02:40Z',
	'wm-private': false,
	url: `https://social.coop/@someone/${id}`,
	published: '2025-09-29T15:55:48+00:00',
	author: { type: 'card', name: 'Someone', url: 'https://social.coop/@someone', photo: 'https://avatars.webmention.io/a.jpg' },
	...extra
});

/** Answers webmention.io's domain listing from a fixed list, as it pages with `since_id`. */
function webmentionIo(all: ReturnType<typeof entry>[], seen: URL[] = []) {
	return (async (input: string | URL) => {
		const url = new URL(String(input));
		seen.push(url);
		if (url.searchParams.has('target')) {
			const target = url.searchParams.get('target');
			return Response.json({ children: all.filter((m) => m['wm-target'] === target) });
		}
		if (url.searchParams.get('token') !== 'secret') return new Response('no', { status: 401 });
		const since = Number(url.searchParams.get('since_id'));
		const perPage = Number(url.searchParams.get('per-page'));
		return Response.json({ children: all.filter((m) => m['wm-id'] > since).slice(0, perPage) });
	}) as unknown as typeof fetch;
}

describe('webmentions', () => {
	test('targets meet at one path whatever form webmention.io gives them', () => {
		expect(targetPath('https://caseyagollan.com/2025/09/29/slug/')).toBe('/2025/09/29/slug/');
		expect(targetPath('http://www.caseyagollan.com/2025/09/29/slug?ref=x#reply')).toBe('/2025/09/29/slug/');
		expect(targetPath('/2025/09/29/slug')).toBe('/2025/09/29/slug/');
		expect(targetPath('https://elsewhere.example/2025/09/29/slug/')).toBeNull();
		expect(postPaths(['/a/', 'https://caseyagollan.com/a', 'https://evil.example/b'])).toEqual(['/a/']);
	});

	test('entries are stored without private or unusable ones', () => {
		const mention = normalizeMention(entry(5, 'in-reply-to', 'https://caseyagollan.com/2025/09/29/slug/', { content: { html: '<p>Hi</p>', text: 'Hi' } }));
		expect(mention).toMatchObject({ id: 5, kind: 'reply', target: '/2025/09/29/slug/', html: '<p>Hi</p>', text: 'Hi', author: { name: 'Someone' } });
		expect(normalizeMention(entry(6, 'like-of', 'https://caseyagollan.com/x/', { 'wm-private': true }))).toBeNull();
		expect(normalizeMention(entry(7, 'rsvp', 'https://caseyagollan.com/x/'))).toBeNull();
		expect(normalizeMention(entry(8, 'like-of', 'https://elsewhere.example/x/'))).toBeNull();
		expect(normalizeMention(entry(9, 'like-of', 'https://caseyagollan.com/x/', { author: { url: 'javascript:alert(1)' } }))?.author.url).toBe('');
	});

	test('mentions group into favorites, reposts and replies', () => {
		const target = 'https://caseyagollan.com/x/';
		const mentions = [entry(1, 'like-of', target), entry(2, 'repost-of', target), entry(3, 'in-reply-to', target), entry(4, 'mention-of', target), entry(5, 'mention-of', target, { content: { text: 'Said something' } })].map((m) => normalizeMention(m)!);
		const groups = groupMentions(mentions);
		expect(groups.likes.map((m) => m.id)).toEqual([1]);
		expect(groups.reposts.map((m) => m.id)).toEqual([2]);
		expect(groups.replies.map((m) => m.id)).toEqual([3, 5]);
		expect(groups.links.map((m) => m.id)).toEqual([4]);
		expect(countMentions(mentions)).toEqual({ like: 1, repost: 1, reply: 3 });
	});

	test('hiding works for one mention or everything from one person', () => {
		const mine = normalizeMention(entry(1, 'like-of', 'https://caseyagollan.com/x/'))!;
		const other = normalizeMention(entry(2, 'like-of', 'https://caseyagollan.com/x/', { author: { name: 'Other', url: 'https://www.other.example/', photo: '' } }))!;
		expect(authorKey(other)).toBe('other.example');
		let moderation = applyModeration(emptyModeration(), { action: 'hide', id: 1 });
		expect(isHidden(mine, moderation)).toBe(true);
		expect(isHidden(other, moderation)).toBe(false);
		moderation = applyModeration(moderation, { action: 'block', author: authorKey(other) });
		moderation = applyModeration(moderation, { action: 'block', author: authorKey(other) });
		expect(moderation.blockedAuthors).toEqual(['other.example']);
		expect(isHidden(other, moderation)).toBe(true);
		moderation = applyModeration(applyModeration(moderation, { action: 'show', id: 1 }), { action: 'unblock', author: 'other.example' });
		expect(moderation).toEqual(emptyModeration());
		expect(parseModerationAction({ action: 'hide', id: -1 })).toBeNull();
		expect(parseModerationAction({ action: 'delete', id: 1 })).toBeNull();
		expect(parseModerationAction({ action: 'block', author: 'social.coop/@x' })).toEqual({ action: 'block', author: 'social.coop/@x' });
	});

	test('the cron copies new mentions and carries on from where it stopped', async () => {
		const store = bucket();
		const target = 'https://caseyagollan.com/2025/09/29/slug/';
		const all = Array.from({ length: 150 }, (_, i) => entry(i + 1, i % 2 ? 'like-of' : 'in-reply-to', i < 140 ? target : 'https://caseyagollan.com/other/', { content: i % 2 ? undefined : { text: `Reply ${i}` } }));
		const seen: URL[] = [];
		const first = await syncWebmentions({ PUBLISHING_STATE: store, WEBMENTION_IO_TOKEN: 'secret' }, webmentionIo(all, seen), () => new Date('2026-11-18T00:00:00Z'));
		expect(first).toMatchObject({ fetched: 150, stored: 150, posts: 2, sinceId: 150, more: false });
		expect(seen.map((url) => url.searchParams.get('since_id'))).toEqual(['0', '100']);
		expect(seen[0].searchParams.get('domain')).toBe('caseyagollan.com');

		all.push(entry(151, 'repost-of', target));
		const second = await syncWebmentions({ PUBLISHING_STATE: store, WEBMENTION_IO_TOKEN: 'secret' }, webmentionIo(all));
		expect(second).toMatchObject({ fetched: 1, stored: 1, sinceId: 151 });

		const { mentions, archived } = await readMentions({ PUBLISHING_STATE: store }, ['/2025/09/29/slug/'], (() => { throw new Error('no live reads once archived'); }) as unknown as typeof fetch);
		expect(archived).toBe(true);
		expect(mentions).toHaveLength(141);
		expect(mentions.at(-1)?.kind).toBe('repost');
		expect(JSON.parse(store.objects.get('webmentions/state.json')!)).toMatchObject({ sinceId: 151, total: 151 });
	});

	test('a sync without a token or bucket does nothing', async () => {
		const store = bucket();
		expect((await syncWebmentions({ PUBLISHING_STATE: store }, webmentionIo([]))).skipped).toBe('no-token');
		expect((await syncWebmentions({ WEBMENTION_IO_TOKEN: 'secret' }, webmentionIo([]))).skipped).toBe('no-bucket');
		expect(store.objects.size).toBe(0);
	});

	test('a failed fetch leaves the copy where it was', async () => {
		const store = bucket();
		const failing = (async () => new Response('down', { status: 502 })) as unknown as typeof fetch;
		await expect(syncWebmentions({ PUBLISHING_STATE: store, WEBMENTION_IO_TOKEN: 'secret' }, failing)).rejects.toThrow('502');
		expect(store.objects.size).toBe(0);
	});

	test('pages read webmention.io live until the bucket has been synced', async () => {
		const target = 'https://caseyagollan.com/2025/09/29/slug/';
		const live = await readMentions({ PUBLISHING_STATE: bucket() }, ['/2025/09/29/slug/'], webmentionIo([entry(1, 'like-of', target), entry(2, 'like-of', 'https://caseyagollan.com/other/')]));
		expect(live.archived).toBe(false);
		expect(live.mentions.map((m) => m.id)).toEqual([1]);
	});

	test('a renamed post keeps mentions sent to its old address', async () => {
		const store = bucket();
		const all = [entry(1, 'like-of', 'https://caseyagollan.com/2025/09/29/old/'), entry(2, 'like-of', 'https://caseyagollan.com/2025/09/29/new/')];
		await syncWebmentions({ PUBLISHING_STATE: store, WEBMENTION_IO_TOKEN: 'secret' }, webmentionIo(all));
		const { mentions } = await readMentions({ PUBLISHING_STATE: store }, ['/2025/09/29/new/', '/2025/09/29/old/']);
		expect(mentions.map((m) => m.id)).toEqual([1, 2]);
	});

	test('counts leave out what the owner hid', async () => {
		const store = bucket();
		const target = 'https://caseyagollan.com/x/';
		const all = [entry(1, 'like-of', target), entry(2, 'like-of', target, { author: { name: 'Spam', url: 'https://spam.example/', photo: '' } }), entry(3, 'in-reply-to', target, { content: { text: 'Hi' } })];
		expect(await readCounts(store)).toBeNull();
		await syncWebmentions({ PUBLISHING_STATE: store, WEBMENTION_IO_TOKEN: 'secret' }, webmentionIo(all));
		expect(await readCounts(store)).toEqual({ '/x/': { like: 2, repost: 0, reply: 1 } });
		await writeModeration(store, applyModeration(emptyModeration(), { action: 'block', author: 'spam.example' }));
		expect((await readModeration(store)).blockedAuthors).toEqual(['spam.example']);
		expect(await readCounts(store)).toEqual({ '/x/': { like: 1, repost: 0, reply: 1 } });
	});

	test('reply markup keeps text and links, nothing that runs', () => {
		const html = sanitizeMentionHtml('<p onclick="x()">Hi <a href="https://a.example" class="u-url" rel="me">@<span>a</span></a> <a href="javascript:alert(1)">bad</a><script>alert(1)</script><img src=x onerror=y><iframe src="https://evil.example"></iframe></p>');
		expect(html).toBe('<p>Hi <a href="https://a.example" rel="nofollow ugc noopener" target="_blank">@<span>a</span></a> <a rel="nofollow ugc noopener" target="_blank">bad</a></p>');
		const mention = normalizeMention(entry(1, 'in-reply-to', 'https://caseyagollan.com/x/', { content: { html: '<p>ok<script>x</script></p>' } }))!;
		expect(publicMention(mention).html).toBe('<p>ok</p>');
	});
});
