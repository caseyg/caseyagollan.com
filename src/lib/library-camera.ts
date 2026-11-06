export interface ShelfBounds { minX: number; maxX: number; minY: number; maxY: number; depth: number }

export function shelfCameraFrame(bounds: ShelfBounds, width: number, height: number, fov: number) {
	const tangent = Math.tan(fov * Math.PI / 360);
	const distance = (bounds.maxX - bounds.minX) / (2 * tangent * (width / height) * 0.84) + bounds.depth;
	const halfHeight = distance * tangent;
	const topMargin = halfHeight * 2 * Math.min(72, height * 0.15) / height;
	const bottomMargin = halfHeight * 2 * 24 / height;
	const y = bounds.maxY - bounds.minY > halfHeight * 2 - topMargin - bottomMargin
		? bounds.maxY + topMargin - halfHeight
		: (bounds.minY + bounds.maxY + topMargin - bottomMargin) / 2;
	return { x: (bounds.minX + bounds.maxX) / 2, y, distance };
}

export function clampShelfTarget(bounds: ShelfBounds, x: number, y: number, halfWidth: number, halfHeight: number, height: number) {
	const clamp = (value: number, low: number, high: number) => low > high
		? (low + high) / 2 : Math.max(low, Math.min(high, value));
	const marginX = halfWidth * 0.16;
	const topMargin = halfHeight * 2 * Math.min(72, height * 0.15) / height;
	const bottomMargin = halfHeight * 2 * 24 / height;
	return {
		x: clamp(x, bounds.minX + halfWidth - marginX, bounds.maxX - halfWidth + marginX),
		y: clamp(y, bounds.minY + halfHeight - bottomMargin, bounds.maxY - halfHeight + topMargin)
	};
}
