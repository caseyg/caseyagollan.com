import { createEditor, type EditorState } from 'lexical';
import {
	HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, HorizontalRuleNode,
	HEADING, QUOTE, CODE, UNORDERED_LIST, ORDERED_LIST, LINK, HR, TEXT_FORMAT_TRANSFORMERS,
	convertFromMarkdownString, convertToMarkdownString
} from 'svelte-lexical';
import { FIGURE, FigureNode } from '$lib/components/editor/figure-node';

/** Markdown the rich editor reads and writes back. Anything else stays literal text. */
export const transformers = [FIGURE, HEADING, QUOTE, CODE, UNORDERED_LIST, ORDERED_LIST, HR, ...TEXT_FORMAT_TRANSFORMERS, LINK];
export const nodes = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, HorizontalRuleNode, FigureNode];

export function importMarkdown(markdown: string): void {
	convertFromMarkdownString(markdown.replace(/\r\n?/g, '\n'), transformers);
}

export function exportMarkdown(state: EditorState): string {
	// Lexical escapes underscores everywhere, which breaks bare URLs when the post is rendered.
	return state.read(() => convertToMarkdownString(transformers)).replace(/https?:\/\/\S+/g, url => url.replace(/\\([_*~])/g, '$1'));
}

/**
 * Whether Markdown survives a trip through the rich editor unchanged, ignoring
 * trailing whitespace. Posts that would not are safer to edit as source.
 */
export function roundTrips(markdown: string): boolean {
	const tidy = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
	try {
		const editor = createEditor({ nodes, onError: error => { throw error; } });
		editor.update(() => importMarkdown(markdown), { discrete: true });
		return tidy(exportMarkdown(editor.getEditorState())) === tidy(markdown);
	} catch { return false; }
}
