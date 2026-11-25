/**
 * The /chat agent's `fetch_page` tool: read a web page's main text with defuddle and
 * hand it to the model as Markdown. Pages on this site are read from the Worker's own
 * assets; anything else goes through `safePublicFetch` (public HTTPS hosts only, a
 * byte limit and a timeout).
 */
import Defuddle from 'defuddle';
import { fromHtml } from 'hast-util-from-html';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { parseHTML } from 'linkedom';
import { safePublicFetch, type PublicFetcher } from '../publishing/public-fetch';

/**
 * Characters of Markdown handed to the model at a time: about two thousand tokens, so reading
 * three pages at once still fits the chat's context. The rest is there to ask for (`from`).
 */
export const PAGE_LIMIT = 8_000;

export interface FetchedPage {
	url: string; title: string; author?: string; published?: string; description?: string;
	/** The part asked for: `PAGE_LIMIT` characters from `from`. */
	markdown: string;
	/** Whether the page goes on past this part. */
	truncated: boolean;
	/** Where this part starts, and how long the whole page is, in characters. */
	from: number;
	total: number;
}

const text = (node: ElementContent | RootContent): string =>
	node.type === 'text' ? node.value : node.type === 'element' ? node.children.map(text).join('') : '';

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'form', 'button', 'nav']);

/**
 * HTML to Markdown for reading, not for storing: unlike `htmlToMarkdown` it never gives
 * up, and keeps the text of anything it has no Markdown for.
 */
export function readableMarkdown(html: string, base: string): string {
	const tree = fromHtml(html, { fragment: true });
	const href = (value: unknown) => { try { return new URL(String(value), base).href; } catch { return undefined; } };
	const inline = (nodes: ElementContent[]): string => nodes.map((node) => {
		if (node.type === 'text') return node.value.replace(/\s+/g, ' ');
		if (node.type !== 'element' || SKIP.has(node.tagName)) return '';
		const inner = inline(node.children);
		switch (node.tagName) {
			case 'a': { const link = href(node.properties.href); return link && inner.trim() ? `[${inner.trim()}](${link})` : inner; }
			case 'strong': case 'b': return inner.trim() ? `**${inner.trim()}**` : '';
			case 'em': case 'i': return inner.trim() ? `*${inner.trim()}*` : '';
			case 'code': return `\`${text(node)}\``;
			case 'br': return '\n';
			case 'img': { const alt = String(node.properties.alt ?? '').trim(); const src = href(node.properties.src); return src ? `![${alt}](${src})` : ''; }
			default: return inner;
		}
	}).join('');
	const blocks = (nodes: (ElementContent | RootContent)[], depth = 0): string[] => {
		const out: string[] = [];
		let run: ElementContent[] = [];
		const flush = () => { const line = inline(run).trim(); if (line) out.push(line); run = []; };
		for (const node of nodes) {
			if (node.type === 'text') { run.push(node); continue; }
			if (node.type !== 'element') continue;
			if (SKIP.has(node.tagName)) continue;
			const tag = node.tagName;
			if (/^h[1-6]$/.test(tag)) { flush(); const line = inline(node.children).trim(); if (line) out.push(`${'#'.repeat(Number(tag[1]))} ${line}`); }
			else if (tag === 'p') { flush(); const line = inline(node.children).trim(); if (line) out.push(line); }
			else if (tag === 'pre') { flush(); out.push(`\`\`\`\n${text(node).replace(/\n$/, '')}\n\`\`\``); }
			else if (tag === 'blockquote') { flush(); out.push(blocks(node.children, depth).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n')); }
			else if (tag === 'ul' || tag === 'ol') {
				flush();
				let n = 1;
				const items = node.children.filter((child): child is Element => child.type === 'element' && child.tagName === 'li').map((item) => {
					const body = blocks(item.children, depth + 1).join('\n').split('\n');
					const marker = tag === 'ol' ? `${n++}.` : '-';
					return `${'  '.repeat(depth)}${marker} ${body[0] ?? ''}${body.slice(1).map((line) => `\n${'  '.repeat(depth + 1)}${line}`).join('')}`;
				});
				if (items.length) out.push(items.join('\n'));
			}
			else if (tag === 'hr') { flush(); out.push('---'); }
			else if (tag === 'table') {
				flush();
				const rows = (function collect(element: Element): Element[] { return element.children.flatMap((child) => child.type !== 'element' ? [] : child.tagName === 'tr' ? [child] : collect(child)); })(node);
				const cells = rows.map((row) => row.children.filter((cell): cell is Element => cell.type === 'element' && ['td', 'th'].includes(cell.tagName)).map((cell) => inline(cell.children).trim().replace(/\|/g, '\\|')));
				if (cells.length) out.push([`| ${cells[0].join(' | ')} |`, `|${cells[0].map(() => ' --- ').join('|')}|`, ...cells.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n'));
			}
			else if (['div', 'section', 'article', 'main', 'header', 'footer', 'figure', 'aside', 'details', 'dl', 'li'].includes(tag)) { flush(); out.push(...blocks(node.children, depth)); }
			else if (tag === 'figcaption') { flush(); const line = inline(node.children).trim(); if (line) out.push(`*${line}*`); }
			else run.push(node);
		}
		flush();
		return out;
	};
	return blocks((tree as Root).children).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Read a page: its title, byline and main text as Markdown. */
export async function fetchPage(address: string, options: { origin: string; assets?: Pick<Fetcher, 'fetch'>; fetcher?: PublicFetcher; from?: number }): Promise<FetchedPage> {
	const from = Math.max(0, Math.floor(Number(options.from) || 0));
	let url: URL;
	try { url = new URL(address, options.origin); } catch { throw new Error('That isn’t a web address.'); }
	url.hash = '';
	const own = url.origin === new URL(options.origin).origin || url.hostname === 'caseyagollan.com';
	const headers = { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; caseyagollan.com chat; +https://caseyagollan.com/chat/)' };
	const response = own && options.assets
		? await options.assets.fetch(new Request(new URL(url.pathname + url.search, options.origin), { headers }))
		: await (options.fetcher ?? safePublicFetch)(url.href, { headers, redirect: 'follow' });
	if (!response.ok) throw new Error(`${url.host} answered ${response.status}.`);
	const type = response.headers.get('content-type') ?? '';
	const body = await response.text();
	if (!/html|xml/i.test(type)) {
		if (/^text\/|json/i.test(type)) return { url: url.href, title: url.pathname.split('/').pop() || url.host, markdown: body.slice(from, from + PAGE_LIMIT), truncated: body.length > from + PAGE_LIMIT, from, total: body.length };
		throw new Error(`${url.host} sent ${type.split(';')[0] || 'something'} rather than a page.`);
	}
	const { document } = parseHTML(body);
	const article = new Defuddle(document as unknown as Document, { url: url.href }).parse();
	const markdown = readableMarkdown(article.content, response.url || url.href);
	return {
		url: response.url || url.href,
		title: (article.title || url.host).replace(/\s+/g, ' ').trim(),
		...(article.author ? { author: article.author } : {}),
		...(article.published ? { published: article.published } : {}),
		...(article.description ? { description: article.description } : {}),
		markdown: markdown.slice(from, from + PAGE_LIMIT),
		truncated: markdown.length > from + PAGE_LIMIT,
		from,
		total: markdown.length
	};
}
