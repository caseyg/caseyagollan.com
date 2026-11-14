import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root } from 'hast';
import { renderContent } from './renderContent';

// Attributes that carry no styling or behavior on this site.
const IGNORED = new Set(['className', 'rel', 'target', 'translate']);

function normalize(html: string): string {
	const tree = fromHtml(html, { fragment: true });
	const visit = (node: Root | Element) => {
		if (node.type === 'element') for (const key of Object.keys(node.properties)) if (IGNORED.has(key)) delete node.properties[key];
		node.children = (node.children as Element['children']).flatMap((child): Element['children'] => {
			if (child.type === 'comment') return [];
			if (child.type === 'text') { const value = child.value.replace(/\s+/g, ' '); return value.trim() ? [{ ...child, value }] : []; }
			// Unstyled spans render exactly like their text.
			if (child.type === 'element' && child.tagName === 'span' && !Object.keys(child.properties).some(key => !IGNORED.has(key))) { visit(child); return child.children; }
			if (child.type === 'element') visit(child);
			return [child];
		});
		// Merge adjacent text left by unwrapped spans.
		node.children = (node.children as Element['children']).reduce<Element['children']>((all, child) => {
			const last = all.at(-1);
			if (last?.type === 'text' && child.type === 'text') last.value = (last.value + child.value).replace(/\s+/g, ' ');
			else all.push(child);
			return all;
		}, []);
		for (const child of node.children) if (child.type === 'text') child.value = child.value.replace(/\s+/g, ' ');
	};
	visit(tree);
	return toHtml(tree).replace(/<p><\/p>/g, '').replace(/\s*(<br>)\s*/g, '$1').replace(/\s*(<\/?(?:p|li|ul|ol|blockquote|h\d|pre)>)\s*/g, '$1').trim();
}

/** True when Markdown renders the same visible post as the HTML it replaces; otherwise a diff summary. */
export function sameRendering(html: string, markdown: string): true | string {
	const before = normalize(renderContent(html, 'html'));
	const after = normalize(renderContent(markdown, 'markdown'));
	if (before === after) return true;
	let i = 0;
	while (i < before.length && before[i] === after[i]) i++;
	return `renders differently: …${before.slice(Math.max(0, i - 40), i + 60)}… vs …${after.slice(Math.max(0, i - 40), i + 60)}…`;
}
