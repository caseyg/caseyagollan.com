/**
 * Markdown read as an outline, for a table: every heading and every list item is a block of its
 * own that hangs from the heading or item it sits under, and the paragraphs under a heading are
 * one block that hangs from it. Each block's words are a rich-text document (TipTap, as tldraw's
 * text blocks keep them), so bold, italics, code, links and struck words stay as written.
 *
 * Pure: the canvas makes the blocks and arrows (`canvas/textBlocks.ts`, `addMarkdownTree`) and
 * the tree layout sets them out (`table-arrange.ts`).
 */
import { marked, type Token, type Tokens } from 'marked';
import type { RichDoc, RichNode } from './voice-notes';

export interface MarkdownNode {
	/** Stable within one tree: `n0`, `n1`, … in reading order. */
	id: string;
	parent?: string;
	/** A heading, a list item, or the paragraphs under a heading. */
	kind: 'heading' | 'item' | 'text';
	/** A heading's level, 1 to 6. */
	level?: number;
	rich: RichDoc;
	/** The block's words without formatting. */
	text: string;
}

export interface MarkdownTree {
	nodes: MarkdownNode[];
	/** Parent to child, in reading order. */
	links: { from: string; to: string }[];
}

/** Past this many blocks, lists stay inside the block they belong to instead of becoming blocks. */
export const MARKDOWN_TREE_MAX = 200;
/** More Markdown than this is not read: a paste of a whole book is not an outline. */
export const MARKDOWN_TEXT_MAX = 200_000;

type Mark = { type: string; attrs?: Record<string, unknown> };

const LIST_LINE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\S/gm;

/**
 * Whether pasted text is written as Markdown: a heading, a list of two lines or more, or inline
 * marks (bold, code, a link). Anything else is left to the canvas's ordinary paste.
 */
export function looksLikeMarkdown(text: string): boolean {
	if (!text.trim() || text.length > MARKDOWN_TEXT_MAX) return false;
	if (/^ {0,3}#{1,6}[ \t]+\S/m.test(text)) return true;
	if ((text.match(LIST_LINE) ?? []).length >= 2) return true;
	return /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|~~[^~\n]+~~/.test(text);
}

/** A file that holds Markdown, by its name or its type. */
export const isMarkdownFile = (file: { name: string; type?: string }) => /\.(md|markdown|mdown|mkd)$/i.test(file.name) || file.type === 'text/markdown' || file.type === 'text/x-markdown';

/** Front matter at the top of a file is not part of what it says. */
const withoutFrontMatter = (text: string) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');

const DECODE: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => DECODE[entity]);

/** Runs of text with their marks, from Markdown's inline tokens. */
function inline(tokens: Token[] | undefined, marks: Mark[] = []): RichNode[] {
	const out: RichNode[] = [];
	const push = (text: string, with_: Mark[] = marks) => {
		if (!text) return;
		const last = out[out.length - 1];
		// Neighbouring runs with the same marks are one run.
		if (last && JSON.stringify(last.marks ?? []) === JSON.stringify(with_)) last.text += text;
		else out.push({ type: 'text', text, ...(with_.length ? { marks: with_ } : {}) });
	};
	const add = (nodes: RichNode[]) => { for (const node of nodes) push(node.text ?? '', (node.marks as Mark[] | undefined) ?? []); };
	const having = (type: string, attrs?: Record<string, unknown>) => (marks.some((mark) => mark.type === type) ? marks : [...marks, { type, ...(attrs ? { attrs } : {}) }]);
	for (const token of tokens ?? []) {
		switch (token.type) {
			case 'strong': add(inline(token.tokens, having('bold'))); break;
			case 'em': add(inline(token.tokens, having('italic'))); break;
			case 'del': add(inline(token.tokens, having('strike'))); break;
			case 'codespan': push(decode(token.text), having('code')); break;
			case 'link': {
				const href = String(token.href ?? '');
				// Only addresses a table can safely open.
				add(inline(token.tokens, /^(https?:|mailto:|\/)/i.test(href) ? having('link', { href, target: '_blank', rel: 'noopener noreferrer nofollow' }) : marks));
				break;
			}
			case 'image': push(token.text || token.href, /^https?:/i.test(token.href) ? having('link', { href: token.href, target: '_blank', rel: 'noopener noreferrer nofollow' }) : marks); break;
			case 'br': push(' '); break;
			case 'html': break;
			case 'text':
			case 'escape':
			default: {
				const inner = (token as Tokens.Text).tokens;
				if (inner?.length) add(inline(inner, marks));
				// A line break inside a paragraph is a space, as Markdown reads it.
				else push(decode(String((token as Tokens.Text).text ?? '')).replace(/\s*\n\s*/g, ' '));
			}
		}
	}
	return out;
}

const paragraph = (content: RichNode[]): RichNode => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const box = (item: Tokens.ListItem): RichNode[] => (item.task ? [{ type: 'text', text: item.checked ? '☑ ' : '☐ ' }] : []);

/** A list item's own words: what it says before any list inside it. */
function itemWords(item: Tokens.ListItem): RichNode[] {
	const blocks = blocksOf(item.tokens.filter((token) => token.type !== 'list'), true);
	const mark = box(item);
	if (!mark.length) return blocks;
	const first = blocks[0];
	return first?.type === 'paragraph' ? [paragraph([...mark, ...(first.content ?? [])]), ...blocks.slice(1)] : [paragraph(mark), ...blocks];
}

/** Markdown's blocks as rich text. `lists` keeps lists as lists inside the block. */
function blocksOf(tokens: Token[], lists: boolean): RichNode[] {
	return tokens.flatMap((token): RichNode[] => {
		switch (token.type) {
			case 'heading': return [{ type: 'heading', attrs: { level: Math.min(6, Math.max(1, token.depth)) }, content: inline(token.tokens) }];
			case 'paragraph': return [paragraph(inline(token.tokens))];
			case 'text': return [paragraph(inline((token as Tokens.Text).tokens ?? [token]))];
			// tldraw's text has no code block or quote: code is a line of code per line, a quote is in italics.
			case 'code': return String(token.text).split('\n').map((line) => paragraph(line ? [{ type: 'text', text: line, marks: [{ type: 'code' }] }] : []));
			case 'blockquote': return blocksOf(token.tokens ?? [], true).map((node) => (node.type === 'paragraph' ? paragraph((node.content ?? []).map((run) => ({ ...run, marks: [...((run.marks as Mark[] | undefined) ?? []).filter((mark) => mark.type !== 'italic'), { type: 'italic' }] }))) : node));
			case 'table': return String(token.raw).trim().split('\n').map((line) => paragraph([{ type: 'text', text: line, marks: [{ type: 'code' }] }]));
			case 'list': {
				if (!lists) return [];
				const list = token as Tokens.List;
				return [{
					type: list.ordered ? 'orderedList' : 'bulletList',
					...(list.ordered && Number(list.start) > 1 ? { attrs: { start: Number(list.start) } } : {}),
					content: list.items.map((item) => ({ type: 'listItem', content: [...itemWords(item), ...blocksOf(item.tokens.filter((inner) => inner.type === 'list'), true)] }))
				}];
			}
			default: return [];
		}
	}).filter((node) => node.type !== 'paragraph' || lists || !!node.content?.length);
}

const plain = (nodes: RichNode[]): string => nodes.map((node) => (node.type === 'text' ? node.text ?? '' : plain(node.content ?? []))).join(nodes.some((node) => node.type !== 'text') ? '\n' : '').trim();

function read(tokens: Token[], lists: boolean): MarkdownTree {
	const nodes: MarkdownNode[] = [];
	const add = (kind: MarkdownNode['kind'], content: RichNode[], parent: string | undefined, level?: number): MarkdownNode | undefined => {
		const text = plain(content);
		if (!text) return undefined;
		const node: MarkdownNode = { id: `n${nodes.length}`, ...(parent ? { parent } : {}), kind, ...(level ? { level } : {}), rich: { type: 'doc', content }, text };
		nodes.push(node);
		return node;
	};
	/** The headings this point in the text sits under, outermost first. */
	const open: MarkdownNode[] = [];
	/** The paragraphs just read, still open for the next paragraph to join. */
	let run: MarkdownNode | undefined;
	const under = () => open[open.length - 1]?.id;

	const items = (list: Tokens.List, parent: string | undefined) => {
		for (const item of list.items) {
			const made = add('item', itemWords(item), parent);
			for (const inner of item.tokens) if (inner.type === 'list') items(inner as Tokens.List, made?.id ?? parent);
		}
	};

	for (const token of tokens) {
		if (token.type === 'heading') {
			while (open.length && (open[open.length - 1].level ?? 0) >= token.depth) open.pop();
			const made = add('heading', blocksOf([token], false), under(), token.depth);
			if (made) open.push(made);
			run = undefined;
		} else if (token.type === 'list' && !lists) {
			// A list hangs from the line that introduces it ("Next steps:"), or from the heading it is under.
			// With no heading at all, the paragraph before it is the nearest thing it has to one.
			const intro = run && (/[:：]$/.test(run.text) || !open.length) ? run.id : under();
			items(token as Tokens.List, intro);
			run = undefined;
		} else {
			const content = blocksOf([token], true);
			if (!content.length) continue;
			if (run) {
				run.rich.content!.push(...content);
				run.text = plain(run.rich.content!);
			} else run = add('text', content, under());
		}
	}
	return { nodes, links: nodes.flatMap((node) => (node.parent ? [{ from: node.parent, to: node.id }] : [])) };
}

/**
 * Markdown as a tree of blocks. Headings nest by level, list items by indent; a long text whose
 * list items would make more than `max` blocks keeps its lists inside the blocks they belong to.
 */
export function markdownTree(markdown: string, max = MARKDOWN_TREE_MAX): MarkdownTree {
	const tokens = marked.lexer(withoutFrontMatter(markdown.slice(0, MARKDOWN_TEXT_MAX)), { gfm: true });
	const tree = read(tokens, false);
	return tree.nodes.length > max ? read(tokens, true) : tree;
}
