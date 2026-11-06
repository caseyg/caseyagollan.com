const entities: Record<string, string> = {
	amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
	eacute: 'é', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…'
};

// Decode catalog text as text, never as executable markup.
export function libraryText(value: string): string {
	return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
		if (!code.startsWith('#')) return entities[code] ?? entity;
		const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
		return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
			? String.fromCodePoint(point) : entity;
	});
}
