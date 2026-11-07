// Keep readable spine text without allocating multi-megabyte textures per book.
export function spineTextureSize(width: number, height: number) {
	const scale = Math.min(512 / height, 128 / width);
	return {
		width: Math.max(16, Math.round(width * scale)),
		height: Math.max(16, Math.round(height * scale))
	};
}
