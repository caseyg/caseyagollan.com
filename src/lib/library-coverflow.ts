/** A shelf is ordered by its baseline, since cover heights vary within a row. */
export function orderShelfBooks<T extends { id: string; x?: number; y?: number; height?: number }>(books: readonly T[]): T[] {
	const baseline = (book: T) => Math.round(((book.y || 0) - (book.height || 0) / 2) * 100);
	return [...books].sort((a, b) => baseline(b) - baseline(a) || (a.x || 0) - (b.x || 0) || a.id.localeCompare(b.id));
}

export function coverflowPosition(start: number, deltaX: number, stride: number, count: number): number {
	return Math.max(0, Math.min(count - 1, start - deltaX / stride));
}

/** Project a short flick, without flinging through the entire catalog. */
export function coverflowDestination(position: number, velocity: number, count: number): number {
	const projection = Math.max(-2, Math.min(2, velocity * 160));
	return Math.max(0, Math.min(count - 1, Math.round(position + projection)));
}

export function coverflowPose(offset: number, stride: number) {
	return { x: offset * stride, z: -Math.min(3, Math.abs(offset)) * stride * 0.18,
		rotationY: -Math.max(-1, Math.min(1, offset)) * 0.65 };
}
