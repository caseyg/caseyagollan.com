import { describe, expect, test } from 'bun:test';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readDocument } from '../src/lib/server/publishing/document';
import { createDraftStore, entryFromFields, fieldsFromForm, fieldsFromQuery, publishEntry, zonedTimestamp } from '../src/lib/server/publishing/composer';
import { draftsConfig } from '../src/lib/server/publishing/config';

const config: PublishingConfig = {
	me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect',
	owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const zone = 'America/New_York';
const b64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));

describe('composer form', () => {
	test('reads local times in the site zone across daylight saving', () => {
		expect(zonedTimestamp('2026-07-04T09:30', zone)).toBe('2026-07-04T09:30:00-04:00');
		expect(zonedTimestamp('2026-12-24T18:00', zone)).toBe('2026-12-24T18:00:00-05:00');
		expect(zonedTimestamp('2026-03-01T12:00', 'Asia/Kolkata')).toBe('2026-03-01T12:00:00+05:30');
		expect(() => zonedTimestamp('tomorrow', zone)).toThrow();
	});

	test('builds a note with photos, alt text, location, tags and syndication', () => {
		const fields = fieldsFromForm(new URLSearchParams([
			['content', 'Hello\r\nworld'], ['format', 'text'], ['category', 'web, #indieweb, web'], ['location', 'geo:40.7,-73.9;u=20'],
			['photo', 'https://files.example/a.jpg'], ['photo-alt', 'A cat'], ['photo', 'https://files.example/b.jpg'], ['photo-alt', ''],
			['syndicate-to', 'https://example.com/syndication/mastodon'], ['slug', 'hello'], ['published', '2026-11-14T08:00']
		]));
		expect(entryFromFields('note', fields, zone)).toEqual({
			type: ['h-entry'],
			properties: {
				content: ['Hello\nworld'], location: ['geo:40.7,-73.9;u=20'], category: ['web', 'indieweb'],
				photo: [{ value: 'https://files.example/a.jpg', alt: 'A cat' }, 'https://files.example/b.jpg'],
				published: ['2026-11-14T08:00:00-05:00'], 'post-status': ['published']
			},
			'mp-slug': ['hello'], 'mp-syndicate-to': ['https://example.com/syndication/mastodon']
		});
	});

	test('maps every Quill post type to its Micropub shape', () => {
		const make = (kind: Parameters<typeof entryFromFields>[0], fields: Record<string, unknown>) => entryFromFields(kind, fields as never, zone).properties;
		expect(make('article', { name: 'Title', summary: 'Sum', content: '# Hi', format: 'markdown' })).toMatchObject({ name: ['Title'], summary: ['Sum'], content: ['# Hi'], 'p3k-content-type': ['text/markdown'] });
		expect(make('reply', { 'in-reply-to': 'https://a.example/post', content: 'Yes' })).toMatchObject({ 'in-reply-to': ['https://a.example/post'], content: ['Yes'] });
		expect(make('bookmark', { 'bookmark-of': 'https://a.example/', name: 'A' })).toMatchObject({ 'bookmark-of': ['https://a.example/'], name: ['A'] });
		expect(make('like', { 'like-of': 'https://a.example/1', content: 'ignored' })).toEqual({ 'like-of': ['https://a.example/1'], 'post-status': ['published'] });
		expect(make('repost', { 'repost-of': 'https://a.example/1' })).toMatchObject({ 'repost-of': ['https://a.example/1'] });
		expect(make('rsvp', { 'in-reply-to': 'https://a.example/event', rsvp: 'maybe' })).toMatchObject({ rsvp: ['maybe'] });
		expect(make('photo', { photo: ['https://f.example/x.jpg'] })).toMatchObject({ photo: ['https://f.example/x.jpg'] });
		expect(make('video', { video: ['https://f.example/x.mp4'] })).toMatchObject({ video: ['https://f.example/x.mp4'] });
		expect(entryFromFields('event', { name: 'Party', start: '2026-12-01T19:00', 'location-name': 'The Hall' }, zone)).toMatchObject({ type: ['h-event'], properties: { name: ['Party'], start: ['2026-12-01T19:00:00-05:00'], location: [{ type: ['h-card'], properties: { name: ['The Hall'] } }] } });
		expect(entryFromFields('review', { 'item-name': 'Book', 'item-url': 'https://b.example/', rating: '4', content: 'Good' }, zone)).toMatchObject({ type: ['h-review'], properties: { item: [{ type: ['h-product'], properties: { name: ['Book'], url: ['https://b.example/'] } }], rating: [4], best: [5], worst: [1] } });
		expect(make('food', { 'food-name': 'Pie' })).toMatchObject({ ate: [{ type: ['h-food'], properties: { name: ['Pie'] } }] });
		expect(make('drink', { 'food-name': 'Tea' })).toMatchObject({ drank: [{ type: ['h-food'], properties: { name: ['Tea'] } }] });
		const legs = fieldsFromForm(new URLSearchParams([
			['leg-transit-type', 'air'], ['leg-operator', 'JetBlue'], ['leg-number', '123'], ['leg-origin', 'JFK'], ['leg-destination', 'SFO'], ['leg-departure', '2026-12-01T08:00'], ['leg-arrival', '2026-12-01T11:30'],
			['leg-transit-type', 'air'], ['leg-operator', ''], ['leg-number', ''], ['leg-origin', ''], ['leg-destination', ''], ['leg-departure', ''], ['leg-arrival', '']
		]));
		expect(legs.legs).toHaveLength(1);
		expect(make('itinerary', legs).itinerary).toEqual([{ type: ['h-leg'], properties: { 'transit-type': ['air'], operator: ['JetBlue'], number: ['123'], origin: ['JFK'], destination: ['SFO'], departure: ['2026-12-01T08:00:00-05:00'], arrival: ['2026-12-01T11:30:00-05:00'] } }]);
	});

	test('rejects incomplete posts with a readable message', () => {
		expect(() => entryFromFields('article', { content: 'x' }, zone)).toThrow('Title is required.');
		expect(() => entryFromFields('like', { 'like-of': 'javascript:alert(1)' }, zone)).toThrow('http or https');
		expect(() => entryFromFields('review', { 'item-name': 'X', rating: '9' }, zone)).toThrow('one to five');
		expect(() => entryFromFields('note', { content: 'x', slug: '../etc' }, zone)).toThrow('slug');
	});

	test('prefills from a bookmarklet the way Quill does', () => {
		expect(fieldsFromQuery('bookmark', new URLSearchParams({ url: 'https://a.example/', title: 'A page', selection: 'quoted\ntext' }))).toEqual({ 'bookmark-of': 'https://a.example/', name: 'A page', content: '> quoted\n> text' });
		expect(fieldsFromQuery('reply', new URLSearchParams({ 'in-reply-to': 'https://a.example/1' }))).toEqual({ 'in-reply-to': 'https://a.example/1' });
	});
});

describe('drafts configuration', () => {
	test('stays off without a separate drafts repository', () => {
		const env = { PUBLISHING_ENABLED: 'true', PUBLISHING_GITHUB_OWNER: 'caseyg', PUBLISHING_GITHUB_REPO: 'caseyagollan-content', PUBLISHING_GITHUB_TOKEN: 't' };
		expect(draftsConfig(env)).toBeUndefined();
		expect(draftsConfig({ ...env, PUBLISHING_DRAFTS_GITHUB_REPO: 'caseyagollan-content' })).toBeUndefined();
		expect(draftsConfig({ ...env, PUBLISHING_ENABLED: 'false', PUBLISHING_DRAFTS_GITHUB_REPO: 'caseyagollan-drafts' })).toBeUndefined();
		expect(draftsConfig({ ...env, PUBLISHING_DRAFTS_GITHUB_REPO: 'caseyagollan-drafts', PUBLISHING_DRAFTS_GITHUB_TOKEN: 'd' })).toEqual({ owner: 'caseyg', repo: 'caseyagollan-drafts', branch: 'main', token: 'd' });
	});
});

describe('private drafts store', () => {
	function fakeRepo() {
		const files = new Map<string, { content: string; sha: string }>();
		let n = 0;
		const calls: string[] = [];
		const fetcher = async (url: string, init: RequestInit) => {
			calls.push(`${init.method ?? 'GET'} ${url}`);
			if (!url.startsWith('https://api.github.com/repos/caseyg/caseyagollan-drafts')) throw new Error(`Unexpected request to ${url}`);
			if (url === 'https://api.github.com/repos/caseyg/caseyagollan-drafts') return Response.json({ private: true });
			const path = new URL(url).pathname.split('/contents/')[1];
			if (path === 'drafts' && (init.method ?? 'GET') === 'GET') {
				const listed = [...files.keys()].filter(key => key.startsWith('drafts/'));
				return listed.length ? Response.json(listed.map(key => ({ type: 'file', name: key.slice(7) }))) : new Response(null, { status: 404 });
			}
			const body = init.body ? JSON.parse(init.body as string) : {};
			const found = files.get(path);
			if (init.method === 'PUT') {
				if (found && body.sha !== found.sha) return new Response(null, { status: 409 });
				const sha = `sha-${++n}`;
				files.set(path, { content: unb64(body.content), sha });
				return Response.json({ content: { sha } });
			}
			if (init.method === 'DELETE') { if (!found || body.sha !== found.sha) return new Response(null, { status: 409 }); files.delete(path); return Response.json({}); }
			return found ? Response.json({ sha: found.sha, encoding: 'base64', content: b64(found.content) }) : new Response(null, { status: 404 });
		};
		return { files, calls, fetcher };
	}
	const settings = { owner: 'caseyg', repo: 'caseyagollan-drafts', branch: 'main', token: 'd' };

	test('saves, lists, updates and removes drafts in the private repository only', async () => {
		const repo = fakeRepo();
		const store = createDraftStore(settings, { fetcher: repo.fetcher, now: () => new Date('2026-11-14T21:00:00Z'), id: () => 'abcd1234' });
		expect(await store.list()).toEqual([]);
		const first = await store.save('article', { name: 'Unfinished', content: 'Half a thought' });
		expect(first.id).toBe('20261114-abcd1234');
		const stored = JSON.parse(repo.files.get('drafts/20261114-abcd1234.json')!.content);
		expect(stored).toMatchObject({ version: 1, kind: 'article', title: 'Unfinished', fields: { content: 'Half a thought' } });
		expect(await store.list()).toEqual([{ id: first.id, kind: 'article', title: 'Unfinished', updated: '2026-11-14T21:00:00.000Z' }]);
		const loaded = (await store.read(first.id))!;
		await expect(store.save('article', { name: 'Stale' }, { id: first.id, sha: 'old', created: loaded.draft.created })).rejects.toThrow('changed');
		const second = await store.save('article', { name: 'Finished' }, { id: first.id, sha: loaded.sha, created: loaded.draft.created });
		expect((await store.read(first.id))!.draft.title).toBe('Finished');
		await store.remove(first.id, second.sha, 'Finished');
		expect(await store.list()).toEqual([]);
		await expect(store.read('../../etc')).rejects.toThrow('Draft not found');
	});
});

describe('publishing from the composer', () => {
	test('creates the post through Micropub as the owner, with no token introspection', async () => {
		const files = new Map<string, string>();
		const fetcher = async (url: string, init: RequestInit) => {
			if (url === config.introspectionEndpoint) throw new Error('The owner session must not call token introspection');
			if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head-0' } });
			if (url === 'https://api.github.com/graphql') {
				for (const added of JSON.parse(init.body as string).variables.input.fileChanges.additions) files.set(added.path, unb64(added.contents));
				return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'commit-1' } } } });
			}
			return new Response(null, { status: 404 });
		};
		const entry = entryFromFields('bookmark', { 'bookmark-of': 'https://a.example/', name: 'A site', content: 'Worth a read', format: 'text', category: 'links', slug: 'a-site' }, zone);
		const location = await publishEntry(config, entry, { fetcher, now: () => new Date('2026-11-14T17:00:00Z') });
		expect(location).toBe('https://example.com/2026/11/14/a-site/');
		const [path, markdown] = [...files.entries()][0];
		expect(path).toBe('bookmarks/2026-11-14-a-site.md');
		expect(readDocument(markdown).properties).toMatchObject({ 'bookmark-of': ['https://a.example/'], name: ['A site'], content: ['Worth a read'], category: ['links'], 'post-status': ['published'] });
	});
});
