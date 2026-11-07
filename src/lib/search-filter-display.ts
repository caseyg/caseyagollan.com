/** Catalog filter values stay unchanged so Pagefind selections keep matching. */
export function authorLabel(value: string): string {
	const comma = value.indexOf(',');
	return comma < 0 ? value : `${value.slice(comma + 1).trim()} ${value.slice(0, comma).trim()}`.trim();
}

export function compareFilterValues(filter: 'Year' | 'Author', a: string, b: string): number {
	if (filter === 'Year') return Number(b) - Number(a);
	const surname = (value: string) => value.includes(',')
		? value.split(',')[0].trim()
		: value.startsWith('@') ? value : value.trim().split(/\s+/).at(-1) ?? value;
	return surname(a).localeCompare(surname(b)) || authorLabel(a).localeCompare(authorLabel(b));
}

/** Reapply presentation after Pagefind creates or updates its filter DOM. */
export function updateFilterDisplay(pane: HTMLElement): void {
	for (const filter of ['Year', 'Author'] as const) {
		const options = pane.querySelector(`[data-filter-name="${filter}"] .pf-filter-options`);
		if (!options) continue;
		const labels = [...options.querySelectorAll<HTMLLabelElement>(':scope > label')];
		const value = (label: HTMLLabelElement) => label.querySelector('input')?.value ?? '';
		if (filter === 'Author') for (const label of labels) {
			const text = [...label.childNodes].find(node => node.nodeType === 3);
			const display = authorLabel(value(label));
			if (text && text.textContent !== display) text.textContent = display;
		}
		const sorted = [...labels].sort((a, b) => compareFilterValues(filter, value(a), value(b)));
		if (sorted.some((label, index) => label !== labels[index])) {
			for (const label of sorted) options.appendChild(label);
		}
	}
}
