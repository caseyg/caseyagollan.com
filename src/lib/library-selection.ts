export function shelfCoverCamera(book: { x: number; y: number; z: number; width: number; height: number }, viewport: { width: number; height: number }, fov: number) {
	const sidebarWidth = viewport.width > 600 ? 320 : 0;
	const availableWidth = Math.max(100, viewport.width - sidebarWidth);
	const availableHeight = viewport.height * (sidebarWidth ? 1 : 0.5);
	const tangent = Math.tan(fov * Math.PI / 360);
	const distance = Math.max(book.height * viewport.height / availableHeight,
		book.width * viewport.height / availableWidth) / (2 * tangent) * 1.35;
	const target = {
		x: book.x + sidebarWidth / viewport.height * distance * tangent,
		y: book.y - (viewport.height - availableHeight) / viewport.height * distance * tangent,
		z: book.z
	};
	return { position: { ...target, z: target.z + distance }, target };
}
