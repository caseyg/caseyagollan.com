import { createEditor, type EditorState } from 'lexical';
import type { ElementTransformer, TextFormatTransformer, Transformer } from '@lexical/markdown';
import {
	HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, HorizontalRuleNode,
	HEADING, QUOTE, CODE, UNORDERED_LIST, ORDERED_LIST, LINK, HR, TEXT_FORMAT_TRANSFORMERS,
	ITALIC_STAR, ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE,
	convertFromMarkdownString, convertToMarkdownString
} from 'svelte-lexical';
import { FIGURE, IMAGE, FigureNode } from '$lib/components/editor/figure-node';
import { QuoteBlockNode, quoteBlock } from '$lib/components/editor/quote-node';

/** Rules are written `---`, as the posts write them, not Lexical's `***`. */
const RULE: ElementTransformer = { ...(HR as ElementTransformer), export: (node, children) => ((HR as ElementTransformer).export(node, children) === null ? null : '---') };

const count = (markdown: string, pattern: RegExp) => markdown.match(pattern)?.length ?? 0;

/**
 * The Markdown the rich editor reads and writes back, for a given post.
 * Emphasis is written with the marks the post already uses (`_` or `*`, `__`
 * or `**`), so an edit doesn't restyle the rest of it. Anything else stays literal text.
 */
export function transformersFor(markdown = ''): Transformer[] {
	const underscoreItalics = count(markdown, /(?<![\w\\_])_(?![_\s])[^_\n]*?[^\s_\\]?_(?![\w_])/g) > count(markdown, /(?<![\\*])\*(?![*\s])[^*\n]*?[^\s*\\]?\*(?!\*)/g);
	const underscoreBold = count(markdown, /(?<![\w\\_])__(?![_\s])/g) > count(markdown, /(?<![\\*])\*\*(?![*\s])/g);
	const first: TextFormatTransformer[] = [underscoreItalics ? ITALIC_UNDERSCORE : ITALIC_STAR, underscoreBold ? BOLD_UNDERSCORE : BOLD_STAR];
	const text = [...first, ...TEXT_FORMAT_TRANSFORMERS.filter(t => !first.includes(t))];
	const list: Transformer[] = [FIGURE, IMAGE, quoteBlock(() => list), HEADING, QUOTE, CODE, UNORDERED_LIST, ORDERED_LIST, RULE, ...text, LINK];
	return list;
}

/** The rules for a new post. */
export const transformers = transformersFor();
export const nodes = [HeadingNode, QuoteNode, QuoteBlockNode, ListNode, ListItemNode, LinkNode, CodeNode, HorizontalRuleNode, FigureNode];

export function importMarkdown(markdown: string, list = transformersFor(markdown)): void {
	convertFromMarkdownString(markdown.replace(/\r\n?/g, '\n'), list);
}

const escape = (value: string) => value.replace(/[*_~]/g, '\\$&');
const url = String.raw`\(([^()\s]+(?: "[^"]*")?)\)`;

/**
 * Lexical closes emphasis before a link and opens it again inside and after,
 * writing `*The&#32;*[*link*](url)*, more*`. Writes it as one run instead:
 * `*The [link](url), more*`.
 */
export function joinEmphasisAroundLinks(markdown: string): string {
	let out = markdown;
	for (const mark of ['**', '__', '*', '_', '~~']) {
		const m = escape(mark);
		const not = `(?<![${escape(mark[0])}\\\\])`;
		const after = `(?!${escape(mark[0])})`;
		const open = `${not}${m}${after}`;
		// Inside a run: close, link, open.
		out = out.replace(new RegExp(`${not}((?:&#32;)?)${m}\\[${m}${after}(.+?)${not}${m}\\]${url}${m}${after}((?:&#32;)?)`, 'g'),
			(_, before, text, href, behind) => `${before ? ' ' : ''}[${text}](${href})${behind ? ' ' : ''}`);
		// Starting a run: link, then the run.
		out = out.replace(new RegExp(`(^|[\\s(])\\[${open}(.+?)${not}${m}\\]${url}${open}((?:&#32;)?)`, 'gm'),
			(_, lead, text, href, behind) => `${lead}${mark}[${text}](${href})${behind ? ' ' : ''}`);
		// Ending a run: the run, then the link.
		out = out.replace(new RegExp(`${not}((?:&#32;)?)${m}\\[${open}(.+?)${not}${m}\\]${url}(?![*_~\\w])`, 'g'),
			(_, before, text, href) => `${before ? ' ' : ''}[${text}](${href})${mark}`);
	}
	return out;
}

export function exportMarkdown(state: EditorState, list = transformers): string {
	const markdown = state.read(() => convertToMarkdownString(list));
	// Lexical escapes underscores everywhere, which breaks bare URLs when the post is rendered.
	return joinEmphasisAroundLinks(markdown).replace(/https?:\/\/\S+/g, href => href.replace(/\\([_*~])/g, '$1'));
}

/**
 * Whether Markdown survives a trip through the rich editor unchanged, ignoring
 * trailing whitespace. Posts that would not are safer to edit as source.
 */
export function roundTrips(markdown: string): boolean {
	const tidy = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
	try {
		const list = transformersFor(markdown);
		const editor = createEditor({ nodes, onError: error => { throw error; } });
		editor.update(() => importMarkdown(markdown, list), { discrete: true });
		return tidy(exportMarkdown(editor.getEditorState(), list)) === tidy(markdown);
	} catch { return false; }
}
