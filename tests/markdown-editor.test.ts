import { describe, expect, test } from 'bun:test';
import { $createParagraphNode, $getRoot, createEditor, type ElementNode } from 'lexical';
import { exportMarkdown, importMarkdown, joinEmphasisAroundLinks, nodes, roundTrips, transformersFor } from '../src/lib/markdown-editor';
import { $isQuoteBlockNode, $leaveQuoteOnEnter, $unquoteOnBackspace, $unquoteSelection } from '../src/lib/components/editor/quote-node';

function load(markdown: string) {
	const list = transformersFor(markdown);
	const editor = createEditor({ nodes, onError: error => { throw error; } });
	editor.update(() => importMarkdown(markdown, list), { discrete: true });
	return { editor, write: () => exportMarkdown(editor.getEditorState(), list) };
}

describe('quotes', () => {
	const prompt = [
		'> Based on the Wikipedia page, here\'s a system prompt:',
		'>',
		'> ---',
		'>',
		'> ## Writing Style Instructions',
		'>',
		'> **Be specific, not symbolic.** State facts directly.',
		'>',
		'> - Starting responses with praise ("Great question!")',
		'> - Em dashes where commas would work better',
		'>',
		'> > A quote inside the quote'
	].join('\n');

	test('a quote of several blocks is read as one quote holding them, and written back', () => {
		const { editor, write } = load(`Here's the prompt I got back:\n\n${prompt}\n\nI added this to Claude.`);
		editor.read(() => {
			const quote = $getRoot().getChildAtIndex(1) as ElementNode;
			expect($isQuoteBlockNode(quote)).toBe(true);
			expect(quote.getChildren().map(node => node.getType())).toEqual(['paragraph', 'horizontalrule', 'heading', 'paragraph', 'list', 'quote']);
		});
		expect(write()).toBe(`Here's the prompt I got back:\n\n${prompt}\n\nI added this to Claude.`);
	});

	test('paragraphs of a quote separated by "> " lines round-trip', () => {
		for (const markdown of ['> One.\n> \n> Two.', '> One.\n>\n> Two.\n\nAfter.', '> A single quote', '> A quote\n> over two lines', '> x\n\n> y']) {
			expect(roundTrips(markdown)).toBe(true);
		}
		expect(load('> One.\n> \n> Two.').write()).toBe('> One.\n>\n> Two.');
	});

	test('a one-paragraph quote stays a plain quote', () => {
		const { editor } = load('> Wikipedia stands as one of the most remarkable achievements.');
		editor.read(() => expect($getRoot().getFirstChild()?.getType()).toBe('quote'));
	});

	test('Enter on an empty last line leaves the quote', () => {
		const { editor, write } = load('> One.\n>\n> Two.');
		editor.update(() => {
			const quote = $getRoot().getFirstChild() as ElementNode;
			const empty = $createParagraphNode();
			quote.append(empty);
			empty.selectStart();
			expect($leaveQuoteOnEnter()).toBe(true);
			expect($getRoot().getChildren().map(node => node.getType())).toEqual(['quote-block', 'paragraph']);
		}, { discrete: true });
		expect(write().trim()).toBe('> One.\n>\n> Two.');
	});

	test('Backspace at the start of a quote unquotes its first line', () => {
		const { editor, write } = load('> One.\n>\n> Two.');
		editor.update(() => {
			(($getRoot().getFirstChild() as ElementNode).getFirstChild() as ElementNode).selectStart();
			expect($unquoteOnBackspace()).toBe(true);
		}, { discrete: true });
		expect(write()).toBe('One.\n\n> Two.');
	});

	test('the Quote button takes the blocks out of a quote', () => {
		const { editor, write } = load('Before.\n\n> One.\n>\n> Two.');
		editor.update(() => {
			(($getRoot().getChildAtIndex(1) as ElementNode).getLastChild() as ElementNode).selectEnd();
			expect($unquoteSelection()).toBe(true);
		}, { discrete: true });
		expect(write()).toBe('Before.\n\nOne.\n\nTwo.');
	});
});

describe('emphasis', () => {
	test('is written with the marks the post already uses', () => {
		for (const markdown of [
			"I mean, it's not _wrong_. But it is **melodramatic**!",
			'It is *not* wrong, and __bold__ too.',
			'A plain paragraph.'
		]) expect(load(markdown).write()).toBe(markdown);
	});

	test('italics around a link are written as one run', () => {
		for (const markdown of [
			'*The [recently acquired shelves](https://caseyagollan.com/library?view=shelves), with books grouped by year.*',
			'*A [saved Bluesky like](https://caseyagollan.com/2026/11/06/c1d5be8d), with its text kept.*',
			'*[A link](https://example.com/) starts it.*',
			'*It ends with [a link](https://example.com/)*',
			'Plain [link](https://example.com/) and *italic* apart.',
			'**Bold [link](https://example.com/) inside.**'
		]) expect(load(markdown).write()).toBe(markdown);
	});

	test('the join only touches emphasis split by a link', () => {
		expect(joinEmphasisAroundLinks('*The&#32;*[*link*](https://x.com/a)*, more.*')).toBe('*The [link](https://x.com/a), more.*');
		expect(joinEmphasisAroundLinks('[*link*](https://x.com/a)')).toBe('[*link*](https://x.com/a)');
		expect(joinEmphasisAroundLinks('a \\*[b](https://x.com/)\\* c')).toBe('a \\*[b](https://x.com/)\\* c');
	});
});

test('rules are written as ---', () => {
	expect(load('Above.\n\n---\n\nBelow.').write()).toBe('Above.\n\n---\n\nBelow.');
});
