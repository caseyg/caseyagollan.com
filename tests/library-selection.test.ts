import { test, expect } from 'bun:test';
import { shelfCoverCamera } from '../src/lib/library-selection';

test('selected covers face forward and fit beside the desktop details panel', () => {
	const book = { x: 40, y: -100, z: 40, width: 20, height: 28 };
	const view = shelfCoverCamera(book, { width: 1280, height: 900 }, 50);
	expect(view.position.x).toBe(view.target.x);
	expect(view.position.y).toBe(view.target.y);
	expect(view.position.z).toBeGreaterThan(book.z);
	const pixelsPerUnit = 900 / (2 * (view.position.z - book.z) * Math.tan(25 * Math.PI / 180));
	expect(640 + (book.x - view.target.x) * pixelsPerUnit).toBeCloseTo(480);
	expect(book.height * pixelsPerUnit).toBeLessThan(900);
});

test('mobile covers fit above the bottom details panel', () => {
	const book = { x: 0, y: 0, z: 35, width: 30, height: 20 };
	const view = shelfCoverCamera(book, { width: 390, height: 844 }, 50);
	const pixelsPerUnit = 844 / (2 * (view.position.z - book.z) * Math.tan(25 * Math.PI / 180));
	expect(422 - (book.y - view.target.y) * pixelsPerUnit).toBeCloseTo(211);
	expect(book.width * pixelsPerUnit).toBeLessThan(390);
	expect(book.height * pixelsPerUnit).toBeLessThan(422);
});

test('shelf arrows follow displayed row order across rows and category/year gaps', async () => {
	const { adjacentShelfBook } = await import('../src/lib/library-selection');
	const books = [
		{ id: 'third', x: -80, y: -50 }, { id: 'second', x: -40, y: 0 },
		{ id: 'fourth', x: -80, y: -150 }, { id: 'first', x: -80, y: 0 }
	];
	expect(adjacentShelfBook(books, 'first', 'right')?.id).toBe('second');
	expect(adjacentShelfBook(books, 'second', 'right')?.id).toBe('third');
	expect(adjacentShelfBook(books, 'third', 'right')?.id).toBe('fourth');
	expect(adjacentShelfBook(books, 'third', 'left')?.id).toBe('second');
	expect(adjacentShelfBook(books, 'first', 'left')?.id).toBe('fourth');
	expect(adjacentShelfBook(books, 'fourth', 'right')?.id).toBe('first');
	expect(adjacentShelfBook([], 'first', 'right')).toBeUndefined();
	expect(adjacentShelfBook([books[0]], 'third', 'right')).toBeUndefined();
});

test('navigation includes every shelf instead of limiting choices to the nearest 50 books', async () => {
	const { adjacentShelfBook } = await import('../src/lib/library-selection');
	const books = Array.from({ length: 120 }, (_, index) => ({ id: String(index), x: index % 50, y: -Math.floor(index / 50) }));
	expect(adjacentShelfBook(books, '49', 'right')?.id).toBe('50');
	expect(adjacentShelfBook(books, '50', 'left')?.id).toBe('49');
	expect(adjacentShelfBook(books, '118', 'right')?.id).toBe('119');
});

test('shelf arrows walk a row left to right even when taller books sit higher', async () => {
	const { adjacentShelfBook } = await import('../src/lib/library-selection');
	// Centered geometries: a 30-tall book on the same shelf has a higher center than a 20-tall one.
	const books = [
		{ id: 'a', x: 0, y: 10, height: 20 }, { id: 'b', x: 2, y: 15, height: 30 },
		{ id: 'c', x: 4, y: 10, height: 20 }, { id: 'd', x: 0, y: -40, height: 30 }
	];
	expect(adjacentShelfBook(books, 'a', 'right')?.id).toBe('b');
	expect(adjacentShelfBook(books, 'b', 'right')?.id).toBe('c');
	expect(adjacentShelfBook(books, 'c', 'right')?.id).toBe('d');
	expect(adjacentShelfBook(books, 'c', 'left')?.id).toBe('b');
});
