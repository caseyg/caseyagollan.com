import { describe, expect, test } from 'bun:test';
import type { PublishingConfig } from '../src/lib/server/publishing/micropub';
import { readDocument } from '../src/lib/server/publishing/document';
import { editorOperations, loadEditorSource, saveEditorPost } from '../src/lib/server/publishing/post-editor';
import { ownerHint, rememberOwner } from '../src/lib/owner';

const config: PublishingConfig = {
	me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect',
	owner: 'caseyg', repo: 'test-content', branch: 'test', token: 'git-secret', timeZone: 'America/New_York'
};
const b64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));

/** An in-memory content repository; token introspection is never reached. */
function setup(path: string, content: string, tree = true) {
	const files = new Map([[path, { content, sha: 'revision-0' }]]);
	const requests: string[] = [];
	let writes = 0;
	const dependencies = {
		now: () => new Date('2026-11-14T17:00:00Z'),
		fetcher: async (url: string, init: RequestInit) => {
			if (url === config.introspectionEndpoint) throw new Error('The owner session must not call token introspection');
			requests.push(url);
			if (url.includes('/git/ref/')) return Response.json({ object: { sha: `head-${writes}` } });
			if (url.includes('/git/trees/')) return tree ? Response.json({ truncated: false, tree: [...files.keys()].map(path => ({ path, type: 'blob' })) }) : new Response(null, { status: 404 });
			if (url === 'https://api.github.com/graphql') {
				const input = JSON.parse(init.body as string).variables.input;
				if (input.expectedHeadOid !== `head-${writes}`) return Response.json({ errors: [{ type: 'STALE_DATA' }] });
				for (const added of input.fileChanges.additions) files.set(added.path, { content: unb64(added.contents), sha: `revision-${writes + 1}` });
				for (const removed of input.fileChanges.deletions ?? []) files.delete(removed.path);
				return Response.json({ data: { createCommitOnBranch: { commit: { oid: `commit-${++writes}` } } } });
			}
			const file = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
			const found = files.get(file);
			return found ? Response.json({ type: 'file', path: file, sha: found.sha, encoding: 'base64', content: b64(found.content) }) : new Response(null, { status: 404 });
		}
	};
	return { dependencies, files, read: () => files.get(path)!.content, writes: () => writes, requests };
}
const url = 'https://example.com/2026/11/06/post/';
const legacy = '---\ndate: 2026-11-06T20:00:00-05:00\ntitle: Old title\ncategory: changelog\ndraft: false\n---\n\n## Heading\n\n* **Markdown** stays\n';

describe('on-site post editor', () => {
	test('loads older Markdown posts as written, not as rendered HTML', async () => {
		const app = setup('articles/2026-11-06-post.md', legacy);
		const source = await loadEditorSource(config, url, app.dependencies);
		expect(source.revision).toBe('"revision-0"');
		expect(source.published).toBe('2026-11-06T20:00:00-05:00');
		expect(source.fields).toEqual({ name: 'Old title', content: '\n## Heading\n\n* **Markdown** stays\n', format: 'markdown', status: 'published', properties: { category: ['changelog'] } });
		expect(source.path).toBe('articles/2026-11-06-post.md');
		expect(source.readOnly).toEqual([{ key: 'draft', values: [false] }]);
	});

	test('finds the post file with one tree request instead of probing every folder and date', async () => {
		for (const tree of [true, false]) {
			const app = setup('articles/2026-11-06-post.md', legacy, tree);
			const source = await loadEditorSource(config, url, app.dependencies);
			expect(source.path).toBe('articles/2026-11-06-post.md');
			const reads = app.requests.filter(request => request.includes('/contents/')).length;
			if (tree) expect(reads).toBe(1); else expect(reads).toBeGreaterThan(20);
		}
	});

	test('saving an untouched form writes nothing', async () => {
		const app = setup('articles/2026-11-06-post.md', legacy);
		const source = await loadEditorSource(config, url, app.dependencies);
		// Browsers submit textareas with CRLF and drop a leading newline.
		const fields = { ...source.fields, content: source.fields.content.trimStart().replaceAll('\n', '\r\n') };
		expect(await saveEditorPost(config, url, source.revision, fields, app.dependencies)).toBe(false);
		expect(app.writes()).toBe(0);
	});

	test('a new slug moves the post and returns its new address; the same slug writes nothing', async () => {
		const app = setup('articles/2026-11-06-post.md', legacy);
		const source = await loadEditorSource(config, url, app.dependencies);
		expect(await saveEditorPost(config, url, source.revision, { ...source.fields, slug: 'post' }, app.dependencies)).toBe(false);
		expect(await saveEditorPost(config, url, source.revision, { ...source.fields, slug: 'better-name' }, app.dependencies)).toBe('https://example.com/2026/11/06/better-name/');
		expect(app.files.has('articles/2026-11-06-post.md')).toBe(false);
		const moved = app.files.get('articles/2026-11-06-better-name.md')!.content;
		expect(moved.endsWith('---\n\n## Heading\n\n* **Markdown** stays\n')).toBe(true);
		expect(moved).toContain('- /2026/11/06/post/');
		expect(app.writes()).toBe(1);
	});

	test('metadata edits leave the Markdown body byte-for-byte intact', async () => {
		const app = setup('articles/2026-11-06-post.md', legacy);
		const source = await loadEditorSource(config, url, app.dependencies);
		expect(await saveEditorPost(config, url, source.revision, { ...source.fields, name: 'New title', properties: { category: ['changelog', '#site', 'site'] } }, app.dependencies)).toBe(true);
		const saved = app.read();
		expect(saved.endsWith('---\n\n## Heading\n\n* **Markdown** stays\n')).toBe(true);
		const doc = readDocument(saved);
		expect(doc.properties.name).toEqual(['New title']);
		expect(doc.properties.category).toEqual(['changelog', 'site']);
		expect(doc.properties.published).toEqual(['2026-11-06T20:00:00-05:00']);
		expect(doc.bodyFormat).toBe('markdown');
	});

	test('content edits keep Markdown as Markdown, including posts without the client marker', async () => {
		for (const content of [legacy, '---\n_micropubContentFormat: markdown\ndate: 2026-11-06T20:00:00-05:00\n---\n> quote\n']) {
			const app = setup('notes/2026-11-06-post.md', content);
			const source = await loadEditorSource(config, url, app.dependencies);
			expect(source.fields.format).toBe('markdown');
			await saveEditorPost(config, url, source.revision, { ...source.fields, content: '**Changed**\r\nline' }, app.dependencies);
			const doc = readDocument(app.read());
			expect(doc.body).toBe('**Changed**\nline');
			expect(doc.bodyFormat).toBe('markdown');
		}
	});

	test('switches content type and clears fields', async () => {
		const app = setup('notes/2026-11-06-post.md', '---\n_micropubContentFormat: markdown\ndate: 2026-11-06T20:00:00-05:00\nsummary: Short\ncategory:\n  - one\n---\n*literal*');
		const source = await loadEditorSource(config, url, app.dependencies);
		await saveEditorPost(config, url, source.revision, { ...source.fields, format: 'text', properties: { summary: [''] } }, app.dependencies);
		const doc = readDocument(app.read());
		expect(doc.bodyFormat).toBe('text');
		expect(doc.body).toBe('*literal*');
		expect(doc.properties.summary).toBeUndefined();
		expect(doc.properties.category).toBeUndefined();
	});

	test('edits reaction targets, sanitizes HTML, and moves posts to draft and back', async () => {
		const app = setup('likes/2026-11-06-post.md', '---\ndate: 2026-11-06T20:00:00-05:00\nlike-of:\n  - https://other.example/a\n---\n');
		let source = await loadEditorSource(config, url, app.dependencies);
		expect(source.fields.properties).toEqual({ 'like-of': ['https://other.example/a'] });
		await saveEditorPost(config, url, source.revision, { ...source.fields, properties: { 'like-of': ['https://other.example/b'] }, content: '<p>Hi<script>alert(1)</script></p>', format: 'html', status: 'draft' }, app.dependencies);
		let doc = readDocument(app.read());
		expect(doc.properties['like-of']).toEqual(['https://other.example/b']);
		expect(doc.properties['post-status']).toEqual(['draft']);
		expect(doc.body).toContain('<p>Hi');
		expect(doc.body).not.toContain('script');
		source = await loadEditorSource(config, url, app.dependencies);
		expect(source.fields).toMatchObject({ format: 'markdown', content: 'Hi', status: 'draft' });
		expect(source.convertedFromHtml).toBe(true);
		await saveEditorPost(config, url, source.revision, { ...source.fields, status: 'published' }, app.dependencies);
		expect(readDocument(app.read()).properties['post-status']).toEqual(['published']);
		source = await loadEditorSource(config, url, app.dependencies);
		await expect(saveEditorPost(config, url, source.revision, { ...source.fields, properties: { 'like-of': [' '] } }, app.dependencies)).rejects.toMatchObject({ status: 422 });
		await expect(saveEditorPost(config, url, source.revision, { ...source.fields, properties: { 'like-of': ['javascript:alert(1)'] } }, app.dependencies)).rejects.toMatchObject({ status: 400 });
	});

	test('rejects stale forms, missing posts and deleted posts', async () => {
		const app = setup('notes/2026-11-06-post.md', '---\n_micropubContentFormat: text\ndate: 2026-11-06T20:00:00-05:00\n---\nHello');
		const first = await loadEditorSource(config, url, app.dependencies);
		await saveEditorPost(config, url, first.revision, { ...first.fields, content: 'Hello again' }, app.dependencies);
		await expect(saveEditorPost(config, url, first.revision, { ...first.fields, content: 'Overwrite' }, app.dependencies)).rejects.toMatchObject({ status: 412 });
		expect(readDocument(app.read()).body).toBe('Hello again');
		await expect(loadEditorSource(config, 'https://example.com/2026/11/06/missing/', app.dependencies)).rejects.toMatchObject({ status: 404 });
		const gone = setup('notes/2026-11-06-post.md', '---\n_micropubContentFormat: text\ndate: 2026-11-06T20:00:00-05:00\ndeleted: true\n---\nHello');
		await expect(loadEditorSource(config, url, gone.dependencies)).rejects.toMatchObject({ status: 410 });
	});

	test('fields the form did not show are left alone', () => {
		const properties = { name: ['Title'], summary: ['Short'], content: ['Body'], published: ['2026-11-06T20:00:00-05:00'] };
		expect(editorOperations(properties, { content: 'Body', format: 'text', status: 'published' })).toEqual({});
	});

	test('frontmatter properties can be added, changed and removed, but structured ones stay put', () => {
		const properties = { content: ['Body'], published: ['2026-11-06T20:00:00-05:00'], syndication: ['https://a.example/1'], photo: [{ value: 'https://a.example/p.jpg', alt: '' }] };
		const fields = { content: 'Body', format: 'text' as const, status: 'published' as const };
		expect(editorOperations(properties, { ...fields, properties: { syndication: ['https://a.example/1', 'https://b.example/2'], 'pesos-source': ['x'] } })).toEqual({ replace: { syndication: ['https://a.example/1', 'https://b.example/2'], 'pesos-source': ['x'] } });
		expect(editorOperations(properties, { ...fields, properties: {} })).toEqual({ delete: ['syndication'] });
		for (const key of ['photo', 'published', 'content', 'draft', '_micropubType', 'Bad Key']) {
			expect(() => editorOperations(properties, { ...fields, properties: { syndication: ['https://a.example/1'], [key]: ['x'] } })).toThrow();
		}
	});

	test('attached photos load with their alt text and save new alt text in place', async () => {
		const photoPost = '---\n_micropubContentFormat: markdown\nphoto:\n  - url: https://files.example/a.jpg\n    alt: ""\n  - https://files.example/b.jpg\ndate: 2026-11-06T20:00:00-05:00\n---\nWow\n';
		const app = setup('photos/2026-11-06-post.md', photoPost);
		const source = await loadEditorSource(config, url, app.dependencies);
		expect(source.photos).toEqual([{ url: 'https://files.example/a.jpg', alt: '' }, { url: 'https://files.example/b.jpg', alt: '' }]);
		expect(source.readOnly.map(row => row.key)).not.toContain('photo');
		expect(await saveEditorPost(config, url, source.revision, { ...source.fields, photoAlts: ['', ''] }, app.dependencies)).toBe(false);
		expect(await saveEditorPost(config, url, source.revision, { ...source.fields, photoAlts: ['A  stamp\non a postcard ', 'The back'] }, app.dependencies)).toBe(true);
		const saved = app.read();
		expect(saved).toContain('photo:\n  - url: https://files.example/a.jpg\n    alt: A stamp on a postcard\n  - url: https://files.example/b.jpg\n    alt: The back\n');
		expect(saved.endsWith('---\nWow\n')).toBe(true);
	});

	test('photo alt text must match the photos the form was opened with', () => {
		const properties = { content: ['Body'], photo: [{ value: 'https://a.example/p.jpg', alt: 'Old' }] };
		const fields = { content: 'Body', format: 'text' as const, status: 'published' as const };
		expect(editorOperations(properties, { ...fields, photoAlts: ['New'] })).toEqual({ replace: { photo: [{ value: 'https://a.example/p.jpg', alt: 'New' }] } });
		expect(editorOperations(properties, { ...fields, photoAlts: ['Old'] })).toEqual({});
		expect(() => editorOperations(properties, { ...fields, photoAlts: ['One', 'Two'] })).toThrow();
	});

	test('HTML posts open as Markdown and are stored as Markdown when saved', async () => {
		const app = setup('notes/2026-11-06-post.md', '---\n_micropubContentFormat: html\ndate: 2026-11-06T20:00:00-05:00\n---\n<p>Hi <a href="https://bsky.app/profile/did:plc:abc">@a.bsky.social</a> &quot;quoted&quot;</p>');
		const source = await loadEditorSource(config, url, app.dependencies);
		expect(source.convertedFromHtml).toBe(true);
		expect(source.fields).toMatchObject({ format: 'markdown', content: 'Hi [@a.bsky.social](https://bsky.app/profile/did:plc:abc) "quoted"' });
		expect(await saveEditorPost(config, url, source.revision, source.fields, app.dependencies)).toBe(true);
		const doc = readDocument(app.read());
		expect(doc.bodyFormat).toBe('markdown');
		expect(doc.body).toBe('Hi [@a.bsky.social](https://bsky.app/profile/did:plc:abc) "quoted"');
		expect(app.read()).not.toContain('p3k-content-type');
	});
});

test('the owner hint survives unavailable storage', () => {
	expect(ownerHint()).toBe(false);
	rememberOwner(true);
	const store = new Map<string, string>();
	(globalThis as any).localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) };
	try {
		rememberOwner(true);
		expect(ownerHint()).toBe(true);
		rememberOwner(false);
		expect(ownerHint()).toBe(false);
	} finally { delete (globalThis as any).localStorage; }
});
