import { test, expect } from 'bun:test';
import { shelfCameraFrame, clampShelfTarget } from '../src/lib/library-camera';
const bounds = { minX: -100, maxX: 200, minY: -1400, maxY: 25, depth: 10 };

test('tall shelves fit the screen width and open at the top rather than fitting the entire height', () => {
	for (const [width, height] of [[1280, 900], [390, 844]]) {
		const frame = shelfCameraFrame(bounds, width, height, 50);
		const halfHeight = frame.distance * Math.tan(25 * Math.PI / 180);
		expect(frame.x).toBe(50);
		expect(frame.y + halfHeight).toBeGreaterThan(bounds.maxY);
		expect(frame.y + halfHeight - bounds.maxY).toBeCloseTo(halfHeight * 2 * 72 / height);
		expect(halfHeight * 2 * width / height).toBeGreaterThan(300);
		expect(halfHeight * 2).toBeLessThan(1425);
	}
});

test('pan limits retain content at all four edges, including after zooming', () => {
	for (const halfHeight of [50, 200, 1500]) {
		const halfWidth = halfHeight * 1.4;
		const low = clampShelfTarget(bounds, -100000, -100000, halfWidth, halfHeight, 900);
		const high = clampShelfTarget(bounds, 100000, 100000, halfWidth, halfHeight, 900);
		expect(low.x + halfWidth).toBeGreaterThan(bounds.minX);
		expect(high.x - halfWidth).toBeLessThan(bounds.maxX);
		expect(low.y + halfHeight).toBeGreaterThan(bounds.minY);
		expect(high.y - halfHeight).toBeLessThan(bounds.maxY);
		if (halfWidth * 2 * 0.84 > 300) expect(low.x).toBe(high.x);
	}
});

test('the initial shelf frame is inside the allowed pan bounds', () => {
	const frame = shelfCameraFrame(bounds, 1280, 900, 50);
	const halfHeight = frame.distance * Math.tan(25 * Math.PI / 180);
	const clamped = clampShelfTarget(bounds, frame.x, frame.y, halfHeight * 1280 / 900, halfHeight, 900);
	expect(clamped.x).toBeCloseTo(frame.x);
	expect(clamped.y).toBeCloseTo(frame.y);
});
