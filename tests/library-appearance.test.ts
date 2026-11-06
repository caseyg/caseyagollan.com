import { test, expect } from 'bun:test';
import { colorSortKey, compareColorKeys, placeholderColor, spineColor } from '../src/lib/library-color';
import { layoutSpine } from '../src/lib/library-spine';

test('neutral spines sort together from white to black before the rainbow', () => {
	const colors = ['rgb(0, 0, 255)', '#333333', '#ffffff', '#ff0000', '#aaaaaa', '#00ff00'];
	colors.sort((a, b) => compareColorKeys(colorSortKey(a), colorSortKey(b)));
	expect(colors).toEqual(['#ffffff', '#aaaaaa', '#333333', '#ff0000', '#00ff00', 'rgb(0, 0, 255)']);
});

test('generated HSL covers participate in the same hue order as RGB and hex covers', () => {
	expect(colorSortKey('hsl(0, 100%, 50%)')).toEqual(colorSortKey('#ff0000'));
	expect(colorSortKey('hsl(120, 100%, 50%)')).toEqual(colorSortKey('rgb(0, 255, 0)'));
	const book = { id: 'Missing cover', averageColor: 'rgb(255, 0, 0)' };
	expect(spineColor(book)).toBe(placeholderColor(book.id));
	expect(spineColor({ ...book, img: 'cover.jpg', w: 100, h: 150 })).toBe(book.averageColor);
	expect(compareColorKeys(colorSortKey('#ffaaaa'), colorSortKey('#990000'))).toBeLessThan(0);
});

const measure = (text: string, size: number) => text.length * size * 0.55;
test('spine title and surname fit thin, wide, tall and short book dimensions', () => {
	for (const [length, thickness] of [[1000, 10], [1000, 150], [500, 200], [100, 30]]) {
		const layout = layoutSpine('A long book title with several words and a lengthy subtitle for wrapping', 'García Márquez', length, thickness, measure);
		expect(layout.lines.length).toBeGreaterThan(0);
		for (const line of layout.lines) expect(measure(line, layout.titleSize)).toBeLessThanOrEqual(layout.titleWidth);
		expect(measure(layout.author, layout.authorSize)).toBeLessThanOrEqual(layout.authorWidth);
		expect(layout.lines.length * layout.titleSize * 1.2).toBeLessThanOrEqual(thickness);
		expect(layout.titleWidth + layout.authorWidth + layout.gap + layout.padding * 2).toBeLessThanOrEqual(length + 0.001);
	}
});

test('wide spines wrap full titles and retain the author instead of making one oversized truncated line', () => {
	const layout = layoutSpine('A moderately long title about architecture and technology', 'Smith', 1000, 220, measure);
	expect(layout.lines.join(' ')).toBe('A moderately long title about architecture and technology');
	expect(layout.lines.length).toBeGreaterThan(1);
	expect(layout.author).toBe('Smith');
	const noAuthor = layoutSpine('Title', '', 1000, 100, measure);
	expect(noAuthor.authorWidth).toBe(0);
});

test('catalog entities decode for display without turning text into markup', async () => {
	const { libraryText } = await import('../src/lib/library-text');
	expect(libraryText('Maangchi&#039;s Real Korean Cooking')).toBe("Maangchi's Real Korean Cooking");
	expect(libraryText('Caf&eacute; &amp; the author&rsquo;s book')).toBe('Café & the author’s book');
	expect(libraryText('A &#x2014; B &#128214;')).toBe('A — B 📖');
	expect(libraryText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>');
	expect(libraryText('&#999999999; &unknown;')).toBe('&#999999999; &unknown;');
});
