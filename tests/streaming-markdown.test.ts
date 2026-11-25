import { describe, expect, test } from 'bun:test';
import { createStreamingRenderer } from '../src/lib/utils/streamingMarkdown';
import { renderContent } from '../src/lib/utils/renderContent';

const reply = '## Hi\n\nPara **one** with [a link](https://example.com).\n\n- a\n- b\n\n- c\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quoted\n\nLast para\nwith a break.';
const flat = (html: string) => html.replace(/\s+/g, '');

describe('streaming Markdown', () => {
	test('renders a reply streamed a few characters at a time the same as rendering it whole', () => {
		const render = createStreamingRenderer();
		for (let end = 1; end < reply.length; end += 3) render(reply.slice(0, end));
		expect(flat(render(reply).join(''))).toBe(flat(renderContent(reply)));
	});

	test('keeps finished blocks and closes the unfinished one', () => {
		const render = createStreamingRenderer();
		const first = render('One.\n\nTwo **bo');
		expect(first).toHaveLength(2);
		expect(first[1]).toContain('<strong>bo</strong>');
		const second = render('One.\n\nTwo **bold** and more');
		expect(second[0]).toBe(first[0]);
	});

	test('starts over when the text is replaced rather than extended', () => {
		const render = createStreamingRenderer();
		render('First answer.\n\nMore');
		expect(flat(render('Something else').join(''))).toBe(flat(renderContent('Something else')));
	});
});
