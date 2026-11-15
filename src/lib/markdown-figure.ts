/**
 * Figures in post Markdown are raw HTML on one block:
 * `<figure class="align-right narrow"><img src="…" alt="…"><figcaption>…</figcaption></figure>`.
 * The rich editor reads that shape into a figure block and writes it back the same way.
 * Anything else (extra attributes, several images, unknown classes) stays literal text.
 */

/** `full` is the text column, `right` floats beside the text, `narrow` floats a phone screenshot. */
export type FigureAlign = 'full' | 'right' | 'narrow';

export interface Figure {
	src: string;
	alt: string;
	/** Caption HTML: text with links, emphasis and code. Empty for none. */
	caption: string;
	align: FigureAlign;
}

const FIGURE = /^<figure(?:\s+class="([^"]*)")?\s*>\s*<img\s+([^>]*?)\s*\/?>\s*(?:<figcaption>([\s\S]*?)<\/figcaption>\s*)?<\/figure>$/;
const ATTRIBUTES = /^(?:[a-z-]+="[^"]*"\s*)*$/;

const ALIGN_CLASSES: Record<string, FigureAlign> = { '': 'full', 'align-right': 'right', 'align-right narrow': 'narrow', 'narrow align-right': 'narrow' };
const CLASS_FOR: Record<FigureAlign, string> = { full: '', right: 'align-right', narrow: 'align-right narrow' };

const decode = (value: string) =>
	value.replace(/&(quot|amp|lt|gt|#39|apos);/g, (_, name: string) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'", apos: "'" })[name]!);
const encode = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Whether a Markdown line opens a figure block. */
export const isFigureStart = (line: string) => /^<figure[\s>]/.test(line);

export function parseFigure(html: string): Figure | null {
	const match = html.trim().match(FIGURE);
	if (!match) return null;
	const [, className = '', attributes, caption = ''] = match;
	const align = ALIGN_CLASSES[className.trim().replace(/\s+/g, ' ')];
	if (!align) return null;

	if (!ATTRIBUTES.test(attributes)) return null;
	const image: Record<string, string> = {};
	for (const [, name, value] of attributes.matchAll(/([a-z-]+)="([^"]*)"/g)) image[name] = decode(value);
	// Only src and alt: anything more is kept as source so it is not lost.
	if (!image.src || Object.keys(image).some(name => name !== 'src' && name !== 'alt')) return null;
	// A caption holding block HTML or another figure is beyond what the editor writes back.
	if (/<\/?(figure|img|p|div|figcaption)\b/i.test(caption)) return null;

	return { src: image.src, alt: image.alt ?? '', caption: caption.trim(), align };
}

export function serializeFigure(figure: Figure): string {
	const className = CLASS_FOR[figure.align];
	const caption = figure.caption.trim();
	return `<figure${className ? ` class="${className}"` : ''}><img src="${encode(figure.src)}" alt="${encode(figure.alt)}">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

const ALLOWED = new Set(['A', 'EM', 'I', 'STRONG', 'B', 'CODE', 'BR']);

/** Keep caption HTML to inline text formatting, with links limited to web, mail and site paths. */
export function sanitizeCaption(root: Node): string {
	const out: string[] = [];
	const walk = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 3) {
				out.push((child.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, ' '));
			} else if (child.nodeType === 1) {
				const element = child as Element;
				const tag = element.tagName === 'I' ? 'EM' : element.tagName === 'B' ? 'STRONG' : element.tagName;
				if (!ALLOWED.has(tag)) { walk(element); continue; }
				if (tag === 'BR') { out.push(' '); continue; }
				const href = element.getAttribute('href') ?? '';
				const link = tag === 'A' && /^(https?:\/\/|mailto:|\/)/.test(href);
				if (tag === 'A' && !link) { walk(element); continue; }
				out.push(link ? `<a href="${encode(href)}">` : `<${tag.toLowerCase()}>`);
				walk(element);
				out.push(`</${tag.toLowerCase()}>`);
			}
		}
	};
	walk(root);
	return out.join('').replace(/\s+/g, ' ').trim();
}
