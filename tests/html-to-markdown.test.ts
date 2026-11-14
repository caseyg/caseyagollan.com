import { test, expect } from 'bun:test';
import { htmlToMarkdown } from '../src/lib/utils/htmlToMarkdown';
import { sameRendering } from '../src/lib/utils/sameRendering';

const cases: [string, string][] = [
	['<p>one</p><p>two<br>three</p>', 'one\n\ntwo\nthree'],
	['<p>a <strong>b</strong> <em>c</em> <code>d</code></p>', 'a **b** *c* `d`'],
	['<p>5 * 3 = [15] and snake_case _x_ &lt;tag&gt;</p>', '5 \\* 3 = \\[15\\] and snake_case \\_x\\_ \\<tag\\>'],
	['<p># not a heading</p><p>1. not a list</p><p>- nor this</p>', '\\# not a heading\n\n1\\. not a list\n\n\\- nor this'],
	['<p><a href="https://example.com/a">label</a> <a href="https://example.com/b">https://example.com/b</a></p>', '[label](https://example.com/a) https://example.com/b'],
	['<blockquote><p>quoted</p></blockquote><ul><li>x</li><li>y</li></ul>', '> quoted\n\n- x\n- y'],
	['<p>&amp;copy; stays text</p>', '\\&copy; stays text']
];

test('HTML converts to Markdown that renders the same', () => {
	for (const [html, markdown] of cases) {
		expect(htmlToMarkdown(html)).toBe(markdown);
		expect(sameRendering(html, markdown)).toBe(true);
	}
});

test('Markup without a Markdown equivalent is not converted', () => {
	expect(htmlToMarkdown('<table><tr><td>x</td></tr></table>')).toBeUndefined();
	expect(htmlToMarkdown('<p><video src="https://example.com/v.mp4"></video></p>')).toBeUndefined();
	expect(sameRendering('<p>see https://example.com</p>', 'see https://example.com')).not.toBe(true);
});
