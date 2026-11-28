import { describe, expect, test } from 'bun:test';
import { draftHref, tableAddress, tablePostFields } from '../src/lib/table-post';
import { createDraftStore, entryFromFields } from '../src/lib/server/publishing/composer';
import { renderContent } from '../src/lib/utils/renderContent';
import { POST } from '../src/routes/api/tables/[id]/post/+server';

const table = { id: 'abc123defg', name: '  Reading  list ', published: true };

describe('a post from a table', () => {
	test('embedding makes a note whose content draws the table', () => {
		const { kind, fields } = tablePostFields('embed', table);
		expect(kind).toBe('note');
		expect(fields.content).toBe('Reading list\n\nhttps://caseyagollan.com/tables/abc123defg/');
		const html = renderContent(fields.content!, 'markdown');
		expect(html).toContain('<iframe src="https://caseyagollan.com/tables/abc123defg/embed"');
		expect(html).toContain('Reading list');
	});

	test('a picture makes a photo post that links back to a published table', () => {
		const { kind, fields } = tablePostFields('picture', table, 'https://files.caseyagollan.com/publishing/2026/11/x.png');
		expect(kind).toBe('photo');
		expect(fields.photo).toEqual(['https://files.caseyagollan.com/publishing/2026/11/x.png']);
		expect(fields['photo-alt']).toEqual(['A table of blocks: Reading list']);
		expect(fields.content).toBe(`[Reading list](${tableAddress(table.id)})`);
		// A link in a sentence stays a link: only an address alone on a line is drawn as the table.
		expect(renderContent(fields.content!, 'markdown')).not.toContain('<iframe');
		const entry = entryFromFields(kind, fields, 'America/New_York');
		expect(JSON.stringify(entry)).toContain('x.png');
	});

	test('a picture of a draft table doesn’t link to an address visitors can’t open', () => {
		const { fields } = tablePostFields('picture', { ...table, published: false }, 'https://files.caseyagollan.com/publishing/2026/11/x.png');
		expect(fields.content).toBe('Reading list');
	});

	test('a name with brackets keeps its link whole', () => {
		const { fields } = tablePostFields('picture', { ...table, name: 'Notes [draft]' }, 'https://files.caseyagollan.com/x.png');
		expect(renderContent(fields.content!, 'markdown')).toContain('>Notes [draft]</a>');
	});

	test('a picture post needs its picture, and a nameless table still gets a title', () => {
		expect(() => tablePostFields('picture', table)).toThrow();
		expect(tablePostFields('embed', { id: 'abc123defg', name: ' ' }).fields.content).toStartWith('Untitled table\n');
	});

	test('the fields save as a composer draft that opens in the composer', async () => {
		const sent: { url: string; body: { message: string; content: string } }[] = [];
		const store = createDraftStore({ owner: 'casey', repo: 'drafts', branch: 'main', token: 't' }, {
			fetcher: (async (url: string, init: RequestInit) => {
				sent.push({ url, body: JSON.parse(String(init.body)) });
				return Response.json({ content: { sha: 'sha1' } }, { status: 201 });
			}) as unknown as typeof fetch,
			now: () => new Date('2026-11-28T12:00:00Z'),
			id: () => 'abcd1234'
		});
		const { kind, fields } = tablePostFields('embed', table);
		const saved = await store.save(kind, fields);
		expect(draftHref(kind, saved.id)).toBe('/new/note/?draft=20261128-abcd1234');
		const draft = JSON.parse(atob(sent[0].body.content));
		expect(draft.kind).toBe('note');
		expect(draft.title).toStartWith('Reading list');
		expect(draft.fields.content).toContain('/tables/abc123defg/');
	});

	test('only the signed-in owner starts one', async () => {
		const request = new Request('https://caseyagollan.com/api/tables/abc123defg/post', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"as":"embed"}' });
		const response = await POST({ params: { id: 'abc123defg' }, request, platform: { env: {} } } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});
