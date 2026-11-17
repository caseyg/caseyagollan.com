import { test, expect } from 'bun:test';
import { isImageLine, parseFigure, parseImage, serializeFigure, serializeImage } from '../src/lib/markdown-figure';

const narrow = '<figure class="align-right narrow"><img src="https://files.caseyagollan.com/a.webp" alt="The composer on a phone: close, a Note menu."><figcaption>The composer opens straight into a note.</figcaption></figure>';
const linked = '<figure class="align-right"><img src="https://files.caseyagollan.com/b.webp" alt="Book spines"><figcaption>The <a href="https://caseyagollan.com/library?view=shelves">recently acquired shelves</a>.</figcaption></figure>';

test('figures in posts read and write back unchanged', () => {
	for (const source of [narrow, linked, '<figure><img src="/a.png" alt=""></figure>']) {
		const figure = parseFigure(source);
		expect(figure).not.toBeNull();
		expect(serializeFigure(figure!)).toBe(source);
	}
	expect(parseFigure(narrow)).toEqual({ src: 'https://files.caseyagollan.com/a.webp', alt: 'The composer on a phone: close, a Note menu.', caption: 'The composer opens straight into a note.', align: 'narrow' });
	expect(parseFigure(linked)?.align).toBe('right');
});

test('figure fields are escaped when written', () => {
	const html = serializeFigure({ src: '/a.png?x=1&y=2', alt: 'A "quoted" <b>', caption: '', align: 'full' });
	expect(html).toBe('<figure><img src="/a.png?x=1&amp;y=2" alt="A &quot;quoted&quot; &lt;b&gt;"></figure>');
	expect(parseFigure(html)).toEqual({ src: '/a.png?x=1&y=2', alt: 'A "quoted" <b>', caption: '', align: 'full' });
});

test('figures the editor cannot write back stay as source', () => {
	for (const source of [
		'<figure class="wide"><img src="/a.png" alt=""></figure>',
		'<figure><img src="/a.png" alt="" width="200"></figure>',
		'<figure><img src="/a.png"><img src="/b.png"></figure>',
		'<figure><img alt="no source"></figure>',
		'<figure><img src="/a.png"><figcaption><p>block</p></figcaption></figure>',
		'<figure id="x"><img src="/a.png"></figure>'
	]) expect(parseFigure(source)).toBeNull();
});

test('Markdown images on their own line read and write back', () => {
	const image = parseImage('![Book spines \\[2026\\]](https://files.example/a.png)');
	expect(image).toEqual({ src: 'https://files.example/a.png', alt: 'Book spines [2026]', caption: '', align: 'full' });
	expect(serializeImage(image!)).toBe('![Book spines \\[2026\\]](https://files.example/a.png)');
	expect(serializeImage({ src: '/a.png', alt: 'Two\nlines ' })).toBe('![Two lines](/a.png)');
	for (const line of ['![a](/a.png "title")', 'Text ![a](/a.png)', '![a](/a.png) text', '![a](<a b.png>)']) expect(isImageLine(line)).toBe(false);
});
