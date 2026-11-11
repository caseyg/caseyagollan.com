export interface ShelfPose {
	x: number; y: number; z: number;
	rotationX: number; rotationY: number; rotationZ: number;
}
export interface ShelfMotion {
	from: ShelfPose;
	target: ShelfPose;
	velocity: ShelfPose;
	startedAt: number;
	delay: number;
	frequency: number;
}
const axes = ['x', 'y', 'z', 'rotationX', 'rotationY', 'rotationZ'] as const;
const zero = (): ShelfPose => ({ x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 });
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const damping = 0.72;

/** Exact damped spring solution: stable at any frame rate, including after a suspended tab. */
export function sampleShelfMotion(motion: ShelfMotion, now: number) {
	if (now < motion.startedAt + motion.delay) return { pose: { ...motion.from }, velocity: zero(), settled: false };
	const time = Math.max(0, (now - motion.startedAt - motion.delay) / 1000);
	const decay = damping * motion.frequency;
	const frequency = motion.frequency * Math.sqrt(1 - damping * damping);
	const envelope = Math.exp(-decay * time);
	const cosine = Math.cos(frequency * time), sine = Math.sin(frequency * time);
	const pose = zero(), velocity = zero();
	let settled = time > 0;
	for (const axis of axes) {
		const displacement = motion.from[axis] - motion.target[axis];
		const initialVelocity = motion.velocity[axis];
		const coefficient = (initialVelocity + decay * displacement) / frequency;
		const wave = displacement * cosine + coefficient * sine;
		pose[axis] = motion.target[axis] + envelope * wave;
		velocity[axis] = envelope * ((-displacement * frequency * sine + coefficient * frequency * cosine) - decay * wave);
		const tolerance = axis.startsWith('rotation') ? 0.001 : 0.025;
		if (Math.abs(pose[axis] - motion.target[axis]) > tolerance || Math.abs(velocity[axis]) > tolerance * 8) settled = false;
	}
	if (settled || time >= 1.6) return { pose: { ...motion.target }, velocity: zero(), settled: true };
	return { pose, velocity, settled: false };
}

export function createShelfMotion(id: string, from: ShelfPose, target: ShelfPose, startedAt: number, velocity?: ShelfPose): ShelfMotion {
	let hash = 2166136261;
	for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
	const distance = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
	const adjusted = { ...target };
	// Take the shortest turn, including when interrupting an overshoot.
	for (const axis of ['rotationX', 'rotationY', 'rotationZ'] as const) {
		adjusted[axis] = from[axis] + Math.atan2(Math.sin(target[axis] - from[axis]), Math.cos(target[axis] - from[axis]));
	}
	const initialVelocity = velocity ? { ...velocity } : zero();
	if (!velocity) {
		// A small lift and angular impulse give moving books weight without changing
		// the final shelf coordinates or running collision physics for the library.
		initialVelocity.z = Math.min(160, distance * 0.7);
		initialVelocity.rotationZ = clamp((target.x - from.x) * 0.025, 1.8);
		initialVelocity.rotationX = clamp((target.y - from.y) * -0.012, 1.2);
	}
	return { from: { ...from }, target: adjusted, velocity: initialVelocity, startedAt,
		// Retarget immediately when sorting again mid-flight; keep existing momentum.
		delay: velocity ? 0 : hash % 125, frequency: 12 + (hash % 31) / 10 };
}
