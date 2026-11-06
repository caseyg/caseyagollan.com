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
