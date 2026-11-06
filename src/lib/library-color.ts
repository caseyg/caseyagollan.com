export function placeholderColor(id: string): string {
	let hash = 0;
	for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
	return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
}

export function spineColor(book: { id: string; averageColor?: string; img?: string; w?: number; h?: number }): string {
	return book.img && book.w && book.h && Number.isFinite(book.w) && Number.isFinite(book.h)
		? book.averageColor || '#666666' : placeholderColor(book.id);
}

// Hue is unstable for near-grays: keep neutrals together, ordered light to dark.
// Then walk around the hue wheel, with a light-to-dark ramp within each hue band.
export function colorSortKey(css: string): number[] {
	let rgb: number[];
	if (css.startsWith('#')) {
		let hex = css.slice(1);
		if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
		rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	} else if (css.startsWith('hsl')) {
		const values = css.match(/[\d.]+/g)?.map(Number) || [];
		const [h, s, l] = [values[0] / 360, values[1] / 100, values[2] / 100];
		const channel = (offset: number) => {
			const k = (offset + h * 12) % 12;
			return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		};
		rgb = [channel(0), channel(8), channel(4)];
	} else {
		rgb = (css.match(/[\d.]+/g) || []).slice(0, 3).map((n) => Number(n) / 255);
	}
	if (rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v))) return [2, 0, 0, 0];
	const [r, g, b] = rgb;
	const max = Math.max(...rgb), min = Math.min(...rgb);
	const chroma = max - min;
	const lightness = (max + min) / 2;
	if (chroma < 0.10) return [0, -lightness, 0, 0];
	let hue = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
	hue *= 60;
	return [1, Math.floor(hue / 20), -lightness, hue];
}

export function compareColorKeys(a: number[], b: number[]): number {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
}
