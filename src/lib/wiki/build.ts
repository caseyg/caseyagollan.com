/**
 * Turns the vault's Markdown into pages for the wiki browser: Obsidian's [[wikilinks]] and
 * ![[embeds]] become site links and images, footnotes get numbers, headings get anchors, and the
 * links between pages are counted both ways for backlinks and the graph. Pure, so the site build
 * and the search index render pages the same way.
 */
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { renderContentSync } from '../utils/renderContent';
import { WIKI_FILES, WIKI_SITE, localWikiHref, resolveWikiUrl, wikiKey, wikiManifest, wikiPath, wikiSlug } from './resolve';
import type { WikiGraphData, WikiHeading, WikiManifest, WikiPage, WikiPageSummary, WikiSourcePage, WikiVault } from './types';

export interface Wiki {
	pages: WikiPage[];
	/** The page the wiki opens on. */
	home?: WikiPage;
	bySlug: Map<string, WikiPage>;
	manifest: WikiManifest;
	graph: WikiGraphData;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const MEDIA = /\.(png|jpe?g|gif|webp|svg|avif|pdf|mp[34]|webm|mov|wav|m4a|ogg)$/i;
const EMBED_MARK = /^⟦embed:([^⟧]*)⟧$/;

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const escapeLabel = (value: string) => value.replace(/([\\[\]*_`])/g, '\\$1');
const fileUrl = (path: string) => WIKI_FILES + path.split('/').map(encodeURIComponent).join('/');

export function headingId(text: string) {
	return wikiKey(text) || 'section';
}

function textOf(node: RootContent | Root): string {
	if (node.type === 'text') return node.value;
	if ('children' in node) return node.children.map((child) => textOf(child)).join('');
	return '';
}

function isElement(node: RootContent | undefined, tag?: string): node is Element {
	return node?.type === 'element' && (!tag || node.tagName === tag);
}

/** Run `transform` over the prose only, never inside fenced or inline code. */
function outsideCode(markdown: string, transform: (text: string) => string) {
	return markdown.split(/(^```[\s\S]*?^```|`[^`\n]+`)/m).map((part, index) => (index % 2 ? part : transform(part))).join('');
}

interface Context {
	page: WikiSourcePage;
	slug: string;
	manifest: WikiManifest;
	attachments: Map<string, string>;
	links: Set<string>;
}

function resolveName(name: string, context: Context) {
	return context.manifest[wikiKey(name)] ?? context.manifest[wikiKey(name.split('/').at(-1)!)];
}

function resolveAttachment(name: string, context: Context) {
	return context.attachments.get(name.toLowerCase()) ?? context.attachments.get(name.split('/').at(-1)!.toLowerCase());
}

/** Obsidian syntax the Markdown renderer doesn't know, rewritten into Markdown and a little HTML. */
function preprocess(markdown: string, context: Context): { markdown: string; footnotes: { id: string; markdown: string; cited: boolean }[]; fields: { name: string; markdown: string }[] } {
	let body = markdown.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
	// Obsidian's %% comments are hidden. A line of three or more % is a stray mark, not a comment's start, and
	// any %% left unpaired is dropped rather than hiding the rest of the page.
	body = outsideCode(body, (text) => text.replace(/^[ \t]*%{3,}[ \t]*$/gm, '').replace(/%%[\s\S]*?%%/g, '').replace(/%{2,}/g, ''));
	// Obsidian allows spaces in a link's address, as in `[mail](mailto:me@x.org?subject=Hi there)`; Markdown doesn't, so encode them.
	body = outsideCode(body, (text) => text.replace(/(\]\()([^()\s<>"']+(?:[ \t]+[^()\s<>"']+)+)\)/g, (_match, open: string, url: string) => `${open}${url.replace(/[ \t]/g, '%20')})`));
	// Dataview's `key:: value` lines are the page's details, shown with its title rather than as text.
	const fields: { name: string; markdown: string }[] = [];
	body = outsideCode(body, (text) => text.replace(/^[ \t]*([A-Za-z][\w -]{0,40}?)::[ \t]*(\S.*)$\n?/gm, (_match, name: string, value: string) => {
		fields.push({ name: name.trim(), markdown: value.trim() });
		return '';
	}));
	const footnotes: { id: string; markdown: string }[] = [];
	body = outsideCode(body, (text) => text.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?: {2,}|\t).*)*)/gm, (_match, id: string, note: string) => {
		footnotes.push({ id, markdown: note.replace(/\n(?: {2,}|\t)/g, '\n') });
		return '';
	}));
	const numbers = new Map(footnotes.map((note, index) => [note.id, index + 1]));
	const cited = new Set<string>();
	const links = (text: string) => text.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (_match, embed: string, inner: string) => (embed ? '' : wikilink(false, inner, context)));
	const rendered = outsideCode(body, (text) =>
			text
				.replace(/\[\^([^\]\s]+)\]/g, (match, id: string) => {
					const number = numbers.get(id);
					if (!number) return match;
					cited.add(id);
					return `<sup class="footnote-ref"><a href="#fn-${number}">${number}</a></sup>`;
				})
				.replace(/==(?=\S)([^=\n]+?)==/g, '<mark>$1</mark>')
				.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (_match, embed: string, inner: string) => wikilink(!!embed, inner, context))
		);
	return {
		markdown: rendered,
		footnotes: footnotes.map((note) => ({ ...note, markdown: outsideCode(note.markdown, links), cited: cited.has(note.id) })),
		fields: fields.map((field) => ({ ...field, markdown: outsideCode(field.markdown, links) }))
	};
}

function wikilink(embed: boolean, inner: string, context: Context): string {
	const [target, ...labelParts] = inner.split('|');
	const label = labelParts.join('|').trim();
	const [name, ...hashParts] = target.trim().split('#');
	const hash = hashParts.join('#').trim();
	const attachment = MEDIA.test(name) || !name ? resolveAttachment(name, context) : undefined;
	if (attachment || (MEDIA.test(name) && embed)) {
		const src = attachment ? fileUrl(attachment) : null;
		const alt = label && !/^\d+(x\d+)?$/.test(label) ? label : name.split('/').at(-1)!.replace(MEDIA, '');
		if (!src) return '';
		if (embed && IMAGE.test(name)) return `![${escapeLabel(alt)}](${src})`;
		return `[${escapeLabel(label || name.split('/').at(-1)!)}](${src})`;
	}
	const slug = name ? resolveName(name, context) : context.slug;
	const text = label || (hash && !name ? hash.replace(/^\^/, '') : name.split('/').at(-1)!) || name;
	if (!slug) return `<span class="wiki-link-missing" title="Not published">${escapeHtml(text)}</span>`;
	if (slug !== context.slug) context.links.add(slug);
	const anchor = hash && !hash.startsWith('^') ? `#${headingId(hash)}` : '';
	if (embed) return `\n\n⟦embed:${slug}${anchor}⟧\n\n`;
	return `[${escapeLabel(text)}](${slug === context.slug && anchor ? anchor : wikiPath(slug) + anchor})`;
}

/** A vault file that a relative link or image names, such as `![](diagram.jpg)` for `Attachments/diagram.jpg`. */
function relativeFile(href: string, context: Context) {
	let name: string;
	try {
		name = decodeURIComponent(href.split(/[?#]/)[0]);
	} catch {
		return undefined;
	}
	if (!MEDIA.test(name)) return undefined;
	const path = resolveAttachment(name.replace(/^\.?\//, ''), context);
	return path ? fileUrl(path) : undefined;
}

/** Point a link in a page at the right place: another wiki page here, a cag.wiki file, or where it was. */
function rewriteLink(link: Element, context: Context): Element | Text {
	const href = String(link.properties.href ?? '');
	if (!href || href.startsWith('#') || href.startsWith('/wiki/') || /^(mailto|tel):/.test(href)) return link;
	const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href);
	const file = relative ? relativeFile(href, context) : undefined;
	if (file) {
		link.properties.href = file;
		return link;
	}
	const absolute = relative ? new URL(href, WIKI_SITE).href : href;
	// Notion exports leave relative links to `.md` files; find their page by name, without Notion's id.
	if (relative && /\.md(#.*)?$/i.test(href)) {
		const name = decodeURIComponent(href.split('#')[0].split('/').at(-1)!).replace(/\.md$/i, '').replace(/\s+[0-9a-f]{32}$/i, '');
		const slug = resolveName(name, context);
		if (!slug) return { type: 'text', value: textOf(link) };
		if (slug !== context.slug) context.links.add(slug);
		link.properties.href = wikiPath(slug);
		return link;
	}
	const local = localWikiHref(absolute, context.manifest);
	if (local) {
		const slug = resolveWikiUrl(absolute, context.manifest)?.slug;
		if (slug && slug !== context.slug) context.links.add(slug);
		link.properties.href = local;
		delete link.properties.target;
		return link;
	}
	// Anywhere else opens in a new tab, marked as leaving the site.
	link.properties.href = absolute;
	if (/^https?:/.test(absolute)) {
		link.properties.target = '_blank';
		link.properties.rel = ['noopener', 'noreferrer'];
		link.properties.className = [...((link.properties.className as string[] | undefined) ?? []), 'external'];
	}
	return link;
}

/** Anchors on headings, site links, numbered footnotes, and lazy images, on the sanitized HTML. */
function finish(html: string, context: Context): { html: string; headings: WikiHeading[]; embeds: Element[] } {
	const tree = fromHtml(html, { fragment: true });
	const headings: WikiHeading[] = [];
	const ids = new Set<string>();
	const embeds: Element[] = [];
	// The page title is shown above the body, so a first heading that repeats it goes.
	const first = tree.children.find((node) => node.type === 'element' || (node.type === 'text' && node.value.trim()));
	if (isElement(first, 'h1') && wikiKey(textOf(first)) === wikiKey(context.page.title)) tree.children.splice(tree.children.indexOf(first), 1);

	function visit(parent: Root | Element) {
		parent.children = parent.children.flatMap((node): (RootContent & ElementContent)[] | RootContent[] => {
			if (node.type !== 'element') return [node];
			if (/^h[1-6]$/.test(node.tagName)) {
				const text = textOf(node).trim();
				let id = headingId(text);
				for (let n = 2; ids.has(id); n++) id = `${headingId(text)}-${n}`;
				ids.add(id);
				node.properties.id = id;
				headings.push({ id, text, level: Number(node.tagName[1]) });
			}
			if (node.tagName === 'p' && node.children.length === 1 && node.children[0].type === 'text') {
				const mark = EMBED_MARK.exec(node.children[0].value.trim());
				if (mark) {
					const placeholder: Element = { type: 'element', tagName: 'div', properties: { className: ['wiki-embed'], dataEmbed: mark[1] }, children: [] };
					embeds.push(placeholder);
					return [placeholder];
				}
			}
			if (node.tagName === 'a') {
				if (isElement(parent as RootContent, 'sup')) {
					// A note cited twice is returned to from its first citation.
					const id = `fnref-${textOf(node)}`;
					if (!ids.has(id)) node.properties.id = id;
					ids.add(id);
					return [node];
				}
				const rewritten = rewriteLink(node, context);
				if (rewritten.type === 'text') return [rewritten];
			}
			if (node.tagName === 'img') {
				node.properties.loading = 'lazy';
				node.properties.decoding = 'async';
				const src = String(node.properties.src ?? '');
				if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) node.properties.src = relativeFile(src, context) ?? new URL(src, WIKI_SITE).href;
			}
			visit(node);
			return [node];
		});
	}
	visit(tree);
	return { html: toHtml(tree), headings, embeds };
}

function excerptOf(html: string, length = 220) {
	const text = textOf(fromHtml(html.replace(/<section class="footnotes"[\s\S]*$/, ''), { fragment: true }))
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= length) return text;
	const cut = text.slice(0, length);
	return `${cut.slice(0, cut.lastIndexOf(' ') > length * 0.6 ? cut.lastIndexOf(' ') : length).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** The part of a rendered page under one heading, up to the next heading at its level or above. */
function section(html: string, id: string) {
	const tree = fromHtml(html, { fragment: true });
	const start = tree.children.findIndex((node) => isElement(node) && node.properties.id === id);
	if (start < 0) return html;
	const level = Number((tree.children[start] as Element).tagName[1]);
	const end = tree.children.findIndex((node, index) => index > start && isElement(node) && /^h[1-6]$/.test(node.tagName) && Number(node.tagName[1]) <= level);
	return toHtml({ type: 'root', children: tree.children.slice(start + 1, end < 0 ? undefined : end) });
}

export function buildWiki(vault: WikiVault): Wiki {
	const manifest = wikiManifest(vault.pages);
	const attachments = new Map<string, string>();
	for (const path of vault.attachments) {
		attachments.set(path.toLowerCase(), path);
		const name = path.split('/').at(-1)!.toLowerCase();
		if (!attachments.has(name)) attachments.set(name, path);
	}
	const rendered = vault.pages.map((page) => {
		const context: Context = { page, slug: wikiSlug(page), manifest, attachments, links: new Set() };
		const { markdown, footnotes, fields } = preprocess(page.markdown, context);
		const notes = footnotes.map((note, index) => `<li id="fn-${index + 1}">${renderContentSync(note.markdown).trim().replace(/^<p>([\s\S]*)<\/p>$/, '$1')}${note.cited ? ` <a href="#fnref-${index + 1}" class="footnote-back" aria-label="Back to the text">↩</a>` : ''}</li>`);
		const html = renderContentSync(markdown) + (notes.length ? `<section class="footnotes" aria-label="Footnotes"><ol>${notes.join('')}</ol></section>` : '');
		const details = fields.map((field) => ({
			name: field.name.charAt(0).toUpperCase() + field.name.slice(1),
			html: finish(renderContentSync(field.markdown).trim().replace(/^<p>([\s\S]*)<\/p>$/, '$1'), context).html
		}));
		return { page, context, fields: details, ...finish(html, context) };
	});
	const html = new Map(rendered.map((entry) => [entry.context.slug, entry]));
	const pages: WikiPage[] = rendered.map(({ page, context, fields, html: body, headings, embeds }) => {
		// Embeds show the other page as it renders on its own, one level deep.
		let finished = body;
		if (embeds.length) {
			finished = body.replace(/<div class="wiki-embed" data-embed="([^"]*)"><\/div>/g, (_match, target: string) => {
				const [slug, id] = target.split('#');
				const source = html.get(slug);
				if (!source) return '';
				const inner = (id ? section(source.html, id) : source.html).replace(/<div class="wiki-embed" data-embed="([^"#]*)[^"]*"><\/div>/g, (_m, other: string) => `<p><a href="${wikiPath(other)}">${escapeHtml(html.get(other)?.page.title ?? other)}</a></p>`);
				return `<div class="wiki-embed"><a class="wiki-embed-title" href="${wikiPath(slug)}${id ? `#${id}` : ''}">${escapeHtml(source.page.title)}</a><div class="wiki-embed-body">${inner}</div></div>`;
			});
		}
		return {
			slug: context.slug,
			title: page.title,
			url: page.url,
			aliases: page.aliases,
			tags: page.tags,
			year: page.year[0],
			fields,
			html: finished,
			excerpt: excerptOf(body),
			headings,
			links: [...context.links].sort(),
			backlinks: []
		};
	});
	const bySlug = new Map(pages.map((page) => [page.slug, page]));
	// A link to a heading that has since been renamed still opens the page, at the top.
	for (const page of pages) {
		page.html = page.html.replace(/href="\/wiki\/([^"#]+)#([^"]+)"/g, (match, slug: string, id: string) => {
			const target = bySlug.get(slug);
			return !target || target.headings.some((heading) => heading.id === id) || /^fn(ref)?-\d+$/.test(id) ? match : `href="/wiki/${slug}"`;
		});
	}
	for (const page of pages) for (const target of page.links) bySlug.get(target)?.backlinks.push(page.slug);
	for (const page of pages) page.backlinks.sort((a, b) => bySlug.get(a)!.title.localeCompare(bySlug.get(b)!.title));
	pages.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
	const links = pages.flatMap((page) => page.links.map((target) => ({ source: page.slug, target })));
	const degree = new Map<string, number>();
	for (const { source, target } of links) {
		degree.set(source, (degree.get(source) ?? 0) + 1);
		degree.set(target, (degree.get(target) ?? 0) + 1);
	}
	const homeSource = vault.pages.find((page) => page.path === vault.home);
	return { pages, home: homeSource ? bySlug.get(wikiSlug(homeSource)) : undefined, bySlug, manifest, graph: { nodes: pages.map((page) => ({ slug: page.slug, title: page.title, degree: degree.get(page.slug) ?? 0 })), links } };
}

export function summarize(page: WikiPage): WikiPageSummary {
	return { slug: page.slug, title: page.title, tags: page.tags, excerpt: page.excerpt, links: page.links.length, backlinks: page.backlinks.length };
}

/** The pages around one page, `depth` links away in either direction, for its local graph. */
export function neighborhood(graph: WikiGraphData, slug: string, depth = 2): WikiGraphData {
	const keep = new Set([slug]);
	let frontier = new Set([slug]);
	for (let step = 0; step < depth && frontier.size; step++) {
		const next = new Set<string>();
		for (const { source, target } of graph.links) {
			if (frontier.has(source) && !keep.has(target)) next.add(target);
			if (frontier.has(target) && !keep.has(source)) next.add(source);
		}
		for (const node of next) keep.add(node);
		frontier = next;
	}
	return { nodes: graph.nodes.filter((node) => keep.has(node.slug)), links: graph.links.filter((link) => keep.has(link.source) && keep.has(link.target)) };
}

/** The top of a page, for a hover preview: whole blocks up to about `length` characters of text. */
export function previewHtml(html: string, length = 600): string {
	const tree = fromHtml(html.replace(/<section class="footnotes"[\s\S]*$/, ''), { fragment: true });
	const kept: RootContent[] = [];
	let count = 0;
	for (const node of tree.children) {
		if (count >= length) break;
		if (isElement(node, 'div') && (node.properties.className as string[] | undefined)?.includes('wiki-embed')) continue;
		kept.push(node);
		count += textOf(node).length;
	}
	return toHtml({ type: 'root', children: kept }).replace(/\s(id)="[^"]*"/g, '');
}
