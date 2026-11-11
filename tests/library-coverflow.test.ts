import { expect, test } from 'bun:test';
import { orderShelfBooks, coverflowPosition, coverflowDestination, coverflowPose } from '../src/lib/library-coverflow';

test('varying cover heights follow shelf baselines and left-to-right order', () => {
	const books = [
		{ id: 'second', x: 20, y: -5, height: 20 },
		{ id: 'third', x: -20, y: -55, height: 20 },
		{ id: 'first', x: -20, y: 0, height: 30 }
	];
	expect(orderShelfBooks(books).map((book) => book.id)).toEqual(['first', 'second', 'third']);
	expect(books[0].id).toBe('second');
});

test('drag tracks fractional books immediately and reverses without a threshold reset', () => {
	expect(coverflowPosition(5, -50, 200, 20)).toBe(5.25);
	expect(coverflowPosition(5, -100, 200, 20)).toBe(5.5);
	expect(coverflowPosition(5, -25, 200, 20)).toBe(5.125);
	expect(coverflowPosition(5, 200, 200, 20)).toBe(4);
});

test('dragging and momentum stop at catalog edges instead of wrapping', () => {
	expect(coverflowPosition(0, 100, 200, 20)).toBe(0);
	expect(coverflowPosition(19, -100, 200, 20)).toBe(19);
	expect(coverflowDestination(0.1, -0.01, 20)).toBe(0);
	expect(coverflowDestination(18.8, 0.01, 20)).toBe(19);
	expect(coverflowDestination(0, 1, 1)).toBe(0);
});

test('slow releases snap nearby while fast flicks project a bounded distance', () => {
	expect(coverflowDestination(5.4, 0, 100)).toBe(5);
	expect(coverflowDestination(5.6, 0, 100)).toBe(6);
	expect(coverflowDestination(5.4, 0.005, 100)).toBe(6);
	expect(coverflowDestination(5.4, 10, 100)).toBe(7);
	expect(coverflowDestination(5.4, -10, 100)).toBe(3);
});

test('filmstrip poses are continuous and symmetric around the centered cover', () => {
	expect(coverflowPose(0, 20)).toEqual({ x: 0, z: -0, rotationY: -0 });
	const left = coverflowPose(-0.5, 20), right = coverflowPose(0.5, 20);
	expect(left.x).toBe(-right.x);
	expect(left.rotationY).toBe(-right.rotationY);
	expect(left.z).toBe(right.z);
	expect(Math.abs(coverflowPose(5, 20).rotationY)).toBeLessThan(Math.PI / 2);
});
