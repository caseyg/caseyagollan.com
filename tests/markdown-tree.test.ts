import { describe, expect, test } from 'bun:test';
import { isMarkdownFile, looksLikeMarkdown, markdownTree } from '../src/lib/markdown-tree';

const outline = (markdown: string, max?: number) => markdownTree(markdown, max).nodes.map((node) => `${node.parent ?? '-'}>${node.id} ${node.kind}${node.level ?? ''} ${node.text}`);

describe('markdownTree', () => {
	test('headings nest under the heading above them by level', () => {
		expect(outline('# h1\n\n## a\n\n### deep\n\n## b\n\n# again')).toEqual(['->n0 heading1 h1', 'n0>n1 heading2 a', 'n1>n2 heading3 deep', 'n0>n3 heading2 b', '->n4 heading1 again']);
	});

	test('a skipped level still hangs from the nearest heading above', () => {
		expect(outline('# top\n\n### far\n\n## near')).toEqual(['->n0 heading1 top', 'n0>n1 heading3 far', 'n0>n2 heading2 near']);
	});

	test('list items are blocks, nested by indent, under their heading', () => {
		expect(outline('## Before\n\n- invite\n  - ask\n  - share\n- book')).toEqual(['->n0 heading2 Before', 'n0>n1 item invite', 'n1>n2 item ask', 'n1>n3 item share', 'n0>n4 item book']);
	});

	test('paragraphs under a heading are one block; a list hangs from the line that introduces it', () => {
		const tree = markdownTree('# Plan\n\nFirst.\n\nSecond.\n\nSteps:\n\n1. a\n2. b');
		expect(tree.nodes.map((node) => node.text)).toEqual(['Plan', 'First.\nSecond.\nSteps:', 'a', 'b']);
		expect(tree.links).toEqual([{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }, { from: 'n1', to: 'n3' }]);
	});

	test('a list with no heading and nothing before it is a row of roots', () => {
		expect(markdownTree('- a\n- b').links).toEqual([]);
	});

	test('formatting is kept as rich text', () => {
		const [heading, text] = markdownTree('# A *b*\n\nwith **bold**, `c<d`, ~~gone~~ and [a link](https://example.com) & more\n\n```\nlet x\n```').nodes;
		expect(heading.rich.content).toEqual([{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A ' }, { type: 'text', text: 'b', marks: [{ type: 'italic' }] }] }]);
		const runs = text.rich.content![0].content!;
		expect(runs.find((run) => run.text === 'bold')?.marks).toEqual([{ type: 'bold' }]);
		expect(runs.find((run) => run.text === 'c<d')?.marks).toEqual([{ type: 'code' }]);
		expect(runs.find((run) => run.text === 'gone')?.marks).toEqual([{ type: 'strike' }]);
		expect((runs.find((run) => run.text === 'a link')?.marks as { attrs: { href: string } }[])[0].attrs.href).toBe('https://example.com');
		expect(runs.at(-1)?.text).toBe(' & more');
		expect(text.rich.content![1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'let x', marks: [{ type: 'code' }] }] });
	});

	test('a link that is not an address to open is plain words', () => {
		const [node] = markdownTree('see **x** [here](javascript:alert(1))').nodes;
		expect(JSON.stringify(node.rich)).not.toContain('javascript');
	});

	test('task items show their box; front matter is left out', () => {
		expect(outline('---\ntitle: x\n---\n# T\n\n- [ ] todo\n- [x] done')).toEqual(['->n0 heading1 T', 'n0>n1 item ☐ todo', 'n0>n2 item ☑ done']);
	});

	test('past the limit, lists stay inside the block they belong to', () => {
		const tree = markdownTree('# T\n\n- a\n  - b\n- c\n\n## U\n\n- d', 4);
		expect(tree.nodes.map((node) => node.kind)).toEqual(['heading', 'text', 'heading', 'text']);
		expect(tree.nodes[1].rich.content![0].type).toBe('bulletList');
	});

	test('nothing to say makes nothing', () => {
		expect(markdownTree('   \n\n---\n').nodes).toEqual([]);
	});
});

describe('looksLikeMarkdown', () => {
	test('headings, lists and inline marks do; plain sentences and lone dashes do not', () => {
		expect(looksLikeMarkdown('# Title')).toBe(true);
		expect(looksLikeMarkdown('- a\n- b')).toBe(true);
		expect(looksLikeMarkdown('1. a\n2. b')).toBe(true);
		expect(looksLikeMarkdown('some **bold** words')).toBe(true);
		expect(looksLikeMarkdown('a [link](https://example.com)')).toBe(true);
		expect(looksLikeMarkdown('Just a sentence. And another one.')).toBe(false);
		expect(looksLikeMarkdown('- one aside')).toBe(false);
		expect(looksLikeMarkdown('#hashtag and 3 * 4 * 5')).toBe(false);
		expect(looksLikeMarkdown('')).toBe(false);
	});
});

test('isMarkdownFile goes by name or type', () => {
	expect(isMarkdownFile({ name: 'Notes.MD', type: '' })).toBe(true);
	expect(isMarkdownFile({ name: 'notes', type: 'text/markdown' })).toBe(true);
	expect(isMarkdownFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
});
