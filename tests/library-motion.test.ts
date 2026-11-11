import { expect, test } from 'bun:test';
import { createShelfMotion, sampleShelfMotion, type ShelfPose } from '../src/lib/library-motion';
const from: ShelfPose = { x: 0, y: 0, z: 0, rotationX: 0, rotationY: Math.PI / 2, rotationZ: 0 };
const target = { ...from, x: 100, y: -40 };

test('books lift, lean, overshoot gently, and settle exactly on their shelf', () => {
	const motion = createShelfMotion('book', from, target, 0);
	let maxX = 0, maxZ = 0, maxLean = 0;
	for (let time = 0; time < 2000; time += 16) {
		const { pose } = sampleShelfMotion(motion, time);
		maxX = Math.max(maxX, pose.x);
		maxZ = Math.max(maxZ, pose.z);
		maxLean = Math.max(maxLean, Math.abs(pose.rotationZ));
	}
	expect(maxX).toBeGreaterThan(target.x);
	expect(maxX).toBeLessThan(110);
	expect(maxZ).toBeGreaterThan(0);
	expect(maxLean).toBeGreaterThan(0);
	expect(maxLean).toBeLessThan(0.15);
	expect(sampleShelfMotion(motion, 2000)).toEqual({ pose: target, velocity: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 }, settled: true });
});

test('stagger and weight vary deterministically without long queues', () => {
	const motions = Array.from({ length: 40 }, (_, i) => createShelfMotion(String(i), from, target, 100));
	expect(new Set(motions.map((motion) => motion.delay)).size).toBeGreaterThan(10);
	expect(new Set(motions.map((motion) => motion.frequency)).size).toBeGreaterThan(10);
	for (const motion of motions) {
		expect(motion.delay).toBeLessThan(125);
		expect(sampleShelfMotion(motion, 100).pose).toEqual(from);
		expect(motion).toEqual(createShelfMotion(String(motions.indexOf(motion)), from, target, 100));
	}
});

test('rapid re-sorting preserves position and velocity instead of restarting at rest', () => {
	const original = createShelfMotion('book', from, target, 0);
	const mid = sampleShelfMotion(original, 240);
	const next = createShelfMotion('book', mid.pose, { ...from, x: -80, y: 60 }, 240, mid.velocity);
	const start = sampleShelfMotion(next, 240);
	expect(next.delay).toBe(0);
	for (const axis of ['x', 'y', 'z', 'rotationX', 'rotationY', 'rotationZ'] as const) {
		expect(start.pose[axis]).toBeCloseTo(mid.pose[axis], 10);
		expect(start.velocity[axis]).toBeCloseTo(mid.velocity[axis], 10);
	}
	expect(sampleShelfMotion(next, 2240).settled).toBe(true);
});

test('rotation takes the short path and suspended tabs settle without numerical instability', () => {
	const motion = createShelfMotion('turn', { ...from, rotationY: Math.PI * 2 + 0.1 }, { ...target, rotationY: 0 }, 0);
	expect(Math.abs(motion.target.rotationY - motion.from.rotationY)).toBeCloseTo(0.1);
	const resumed = sampleShelfMotion(motion, 60_000);
	expect(resumed.settled).toBe(true);
	expect(Object.values(resumed.pose).every(Number.isFinite)).toBe(true);
});
