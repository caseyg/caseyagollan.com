import { fromHtml } from 'hast-util-from-html';
import type { Element, ElementContent, RootContent } from 'hast';

/**
 * Convert the HTML that social networks and older Micropub clients send into the
 * Markdown this site stores by default. Only markup with an exact Markdown
 * equivalent is converted: anything else (tables, embeds, media, attributes that
 * change rendering) returns undefined so the caller can keep the HTML as written.
 *
 * Classes, rel and other presentational attributes are dropped; Mastodon's
 * `invisible`/`ellipsis` spans are not styled on this site, so their text is kept.
 */
export function htmlToMarkdown(html: string): string | undefined {
	const tree = fromHtml(html, { fragment: true });
	try {
		return blocks(tree.children).join('\n\n').trim();
	} catch (cause) {
		if (cause instanceof Unsupported) return undefined;
		throw cause;
	}
}

class Unsupported extends Error {}

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'ul', 'ol', 'pre', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const INLINE_WRAPPERS = new Set(['span', 'small', 'abbr', 'cite', 'time', 'mark', 'u', 'sup', 'sub']);

/** Wrappers that render exactly like their children on this site. */
function unwrap(node: Element) {
	return INLINE_WRAPPERS.has(node.tagName) && !['sup', 'sub', 'u', 'mark', 'small', 'abbr'].includes(node.tagName);
}

function blocks(children: (RootContent | ElementContent)[]): string[] {
	const out: string[] = [];
	let run: (RootContent | ElementContent)[] = [];
	const flush = () => {
		const text = paragraph(run);
		if (text) out.push(text);
		run = [];
	};
	for (const child of children) {
		if (child.type === 'comment' || child.type === 'doctype') continue;
		if (child.type === 'element' && BLOCK.has(child.tagName)) { flush(); out.push(...block(child)); }
		else run.push(child);
	}
	flush();
	return out.filter(Boolean);
}

function block(node: Element): string[] {
	const name = node.tagName;
	if (name === 'p') { const text = paragraph(node.children); return text ? [text] : []; }
	if (['div', 'section', 'article', 'header', 'footer'].includes(name)) return blocks(node.children);
	if (name === 'hr') return ['---'];
	if (/^h[1-6]$/.test(name)) return [`${'#'.repeat(Number(name[1]))} ${inline(node.children).replace(/\n/g, ' ').trim()}`];
	if (name === 'blockquote') {
		const inner = blocks(node.children).join('\n\n');
		return [inner.split('\n').map(line => line ? `> ${line}` : '>').join('\n')];
	}
	if (name === 'ul' || name === 'ol') {
		const start = typeof node.properties.start === 'number' ? node.properties.start : 1;
		const items = node.children.filter((child): child is Element => child.type === 'element');
		if (items.some(item => item.tagName !== 'li')) throw new Unsupported();
		return [items.map((item, index) => {
			const marker = name === 'ol' ? `${start + index}. ` : '- ';
			const body = blocks(item.children).join('\n\n');
			return marker + body.split('\n').map((line, i) => i && line ? ' '.repeat(marker.length) + line : line).join('\n');
		}).join('\n')];
	}
	if (name === 'pre') {
		const code = node.children.length === 1 && node.children[0].type === 'element' && node.children[0].tagName === 'code' ? node.children[0] : node;
		const text = textOf(code);
		const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
		return [`${fence}\n${text.replace(/\n$/, '')}\n${fence}`];
	}
	throw new Unsupported();
}

function paragraph(children: (RootContent | ElementContent)[]): string {
	const text = inline(children as ElementContent[]);
	return text.split('\n').map(line => escapeLineStart(line.trim())).join('\n').replace(/^\n+|\n+$/g, '');
}

function textOf(node: Element | ElementContent): string {
	if (node.type === 'text') return node.value;
	if (node.type === 'element') return node.children.map(textOf).join('');
	return '';
}

function inline(children: ElementContent[]): string {
	let out = '';
	for (const child of children) {
		if (child.type === 'comment') continue;
		if (child.type === 'text') { out += escapeText(child.value.replace(/[ \t\r\n\f]+/g, ' ')); continue; }
		if (child.type !== 'element') continue;
		const name = child.tagName;
		if (name === 'br') { out += '\n'; continue; }
		if (name === 'a') { out += link(child); continue; }
		if (name === 'strong' || name === 'b') { out += wrap('**', inline(child.children)); continue; }
		if (name === 'em' || name === 'i') { out += wrap('*', inline(child.children)); continue; }
		if (name === 'del' || name === 's') { out += wrap('~~', inline(child.children)); continue; }
		if (name === 'code') {
			const text = textOf(child);
			const ticks = '`'.repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
			out += text.startsWith('`') || text.endsWith('`') ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
			continue;
		}
		if (name === 'img') {
			const src = child.properties.src;
			if (typeof src !== 'string' || Object.keys(child.properties).some(key => !['src', 'alt', 'title'].includes(key))) throw new Unsupported();
			out += `![${escapeText(String(child.properties.alt ?? ''))}](${destination(src)})`;
			continue;
		}
		if (unwrap(child)) { out += inline(child.children); continue; }
		throw new Unsupported();
	}
	return out;
}

/** Emphasis markers must hug their text, so move surrounding spaces outside. */
function wrap(marker: string, text: string) {
	const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
	return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : text;
}

function link(node: Element): string {
	const href = node.properties.href;
	if (typeof href !== 'string' || !href) return inline(node.children);
	const label = inline(node.children);
	const plain = textOf(node).replace(/\s+/g, ' ').trim();
	// A bare web address renders as the same link when Markdown autolinks it. Plain URLs
	// (not <url>) also stay links in the rich text editor.
	if (plain === href && /^https?:\/\/[^\s<>()[\]`*~\\]+$/.test(href) && !/[.,:;!?'"]$/.test(href)) return href;
	const title = typeof node.properties.title === 'string' ? ` "${node.properties.title.replace(/"/g, '\\"')}"` : '';
	return `[${label.replace(/\n/g, ' ').trim()}](${destination(href)}${title})`;
}

function destination(url: string) {
	return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
}

function escapeText(text: string): string {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/[`*[\]<>~|]/g, '\\$&')
		// Intraword underscores never emphasise in GFM; only escape ones at word edges.
		.replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (match) => match.replace('_', '\\_'))
		// Keep text like "&copy;" from being read as an entity.
		.replace(/&(?=#?[a-zA-Z0-9]+;)/g, '\\&');
}

/** Text at the start of a line must not become a heading, list, quote or rule. */
function escapeLineStart(line: string): string {
	if (/^[-=]+$/.test(line) || /^(?:[-*_] *){3,}$/.test(line)) return `\\${line}`;
	return line
		.replace(/^(#{1,6})(?=\s|$)/, '\\$1')
		.replace(/^([-+])(?=\s|$)/, '\\$1')
		.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
}

