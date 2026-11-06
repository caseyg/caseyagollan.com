// All sizes are texture pixels. The long axis follows the book's height.
export function layoutSpine(
	title: string, author: string, length: number, thickness: number,
	measure: (text: string, size: number) => number
) {
	const padding = Math.min(thickness * 0.25, length * 0.035);
	const authorSize = Math.min(thickness * 0.4, length * 0.045);
	const authorWidth = author ? Math.min(length * 0.28, measure(author, authorSize)) : 0;
	const gap = author ? Math.max(padding * 2, length * 0.035) : 0;
	const titleWidth = Math.max(1, length - padding * 2 - authorWidth - gap);
	const maxSize = Math.min(thickness * 0.58, length * 0.065);
	const fit = (text: string, width: number, size: number) => {
		if (measure(text, size) <= width) return text;
		while (text.length && measure(text + '…', size) > width) text = text.slice(0, -1);
		return text ? text + '…' : '';
	};
	let lines: string[] = [];
	let size = maxSize;
	for (; size >= maxSize * 0.55; size *= 0.9) {
		const maxLines = Math.min(3, Math.max(1, Math.floor((thickness - padding) / (size * 1.2))));
		lines = [''];
		for (const word of title.split(/\s+/)) {
			const index = lines.length - 1;
			const candidate = lines[index] ? lines[index] + ' ' + word : word;
			if (measure(candidate, size) <= titleWidth || !lines[index]) lines[index] = candidate;
			else lines.push(word);
		}
		if (lines.length <= maxLines && lines.every((line) => measure(line, size) <= titleWidth)) break;
		if (size * 0.9 < maxSize * 0.55) {
			lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
			lines = lines.map((line) => fit(line, titleWidth, size));
			break;
		}
	}
	return { padding, titleSize: size, lines, titleWidth, authorSize, author: fit(author, authorWidth, authorSize), authorWidth, gap };
}
