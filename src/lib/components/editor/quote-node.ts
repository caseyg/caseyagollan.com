import {
	$applyNodeReplacement, $getSelection, $isRangeSelection, ElementNode,
	type EditorConfig, type LexicalNode, type RangeSelection, type SerializedElementNode
} from 'lexical';
import type { ElementTransformer, MultilineElementTransformer, Transformer } from '@lexical/markdown';
import { convertFromMarkdownString, convertToMarkdownString } from 'svelte-lexical';


/**
 * A quote that holds whole blocks: several paragraphs, headings, lists or rules,
 * as a Markdown blockquote can. Single-paragraph quotes stay Lexical quotes.
 * Inside, it behaves like the top of the document. Blank lines are written `>`.
 */
export class QuoteBlockNode extends ElementNode {
	static getType() { return 'quote-block'; }
	static clone(node: QuoteBlockNode) { return new QuoteBlockNode(node.__key); }
	static importJSON(json: SerializedElementNode) { return $createQuoteBlockNode().updateFromJSON(json); }

	createDOM(config: EditorConfig): HTMLElement {
		const element = document.createElement('blockquote');
		const className = config.theme.quote;
		if (typeof className === 'string') element.className = className;
		return element;
	}

	updateDOM() { return false; }
	isShadowRoot() { return true; }
	canBeEmpty() { return false; }
	isInline() { return false; }

	/** Writes the quote's blocks with each line marked as quoted. */
	toMarkdown(transformers: Transformer[]): string {
		return convertToMarkdownString(transformers, this).split('\n').map(line => (line ? `> ${line}` : '>')).join('\n');
	}
}

export function $createQuoteBlockNode(): QuoteBlockNode {
	return $applyNodeReplacement(new QuoteBlockNode());
}

export function $isQuoteBlockNode(node: LexicalNode | null | undefined): node is QuoteBlockNode {
	return node instanceof QuoteBlockNode;
}

/** The quote block the selection is in, if any, and the block of it the selection starts in. */
function $quotedBlock(selection: RangeSelection): { quote: QuoteBlockNode; block: LexicalNode } | null {
	let block: LexicalNode | null = selection.anchor.getNode();
	while (block) {
		const parent: LexicalNode | null = block.getParent();
		if ($isQuoteBlockNode(parent)) return { quote: parent, block };
		block = parent;
	}
	return null;
}

/** Moves a block of a quote out, just after or before it, keeping the rest quoted. */
function $lift(quote: QuoteBlockNode, block: LexicalNode, where: 'before' | 'after') {
	if (where === 'after') {
		const after = block.getNextSiblings();
		quote.insertAfter(block);
		if (after.length) {
			const rest = $createQuoteBlockNode();
			rest.append(...after);
			block.insertAfter(rest);
		}
	} else {
		quote.insertBefore(block);
	}
	if (quote.getChildrenSize() === 0) quote.remove();
}

/**
 * Enter on an empty last line of a quote leaves the quote, as it does for a
 * single-paragraph quote. Returns whether it handled the key.
 */
export function $leaveQuoteOnEnter(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
	const found = $quotedBlock(selection);
	if (!found || found.block.getTextContent() !== '' || found.block.getNextSibling() || found.block.getType() !== 'paragraph') return false;
	$lift(found.quote, found.block, 'after');
	(found.block as ElementNode).selectStart();
	return true;
}

/** Backspace at the very start of a quote takes its first block out of the quote. */
export function $unquoteOnBackspace(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0) return false;
	const found = $quotedBlock(selection);
	if (!found || found.block.getPreviousSibling() || found.block.getType() !== 'paragraph') return false;
	const first = (found.block as ElementNode).getFirstDescendant();
	const anchor = selection.anchor.getNode();
	if (first ? anchor !== first && anchor !== found.block : anchor !== found.block) return false;
	$lift(found.quote, found.block, 'before');
	return true;
}

/** Takes the blocks of every quote the selection touches out of their quotes. Returns whether there were any. */
export function $unquoteSelection(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return false;
	const quotes = new Set<QuoteBlockNode>();
	for (const node of selection.getNodes()) {
		for (let current: LexicalNode | null = node; current; current = current.getParent()) {
			if ($isQuoteBlockNode(current)) { quotes.add(current); break; }
		}
	}
	for (const quote of quotes) {
		for (const child of quote.getChildren()) quote.insertBefore(child);
		quote.remove();
	}
	return quotes.size > 0;
}

/**
 * Reads a blockquote that spans blank lines or holds other blocks (headings,
 * lists, rules, nested quotes) into a quote block, using the same Markdown
 * rules as the rest of the post. Simpler quotes are left to Lexical's quote.
 */
export function quoteBlock(list: () => Transformer[]): MultilineElementTransformer {
	const transformer: MultilineElementTransformer = {
		type: 'multiline-element',
		dependencies: [QuoteBlockNode],
		regExpStart: /^>/,
		handleImportAfterStartMatch({ lines, rootNode, startLineIndex }) {
			let end = startLineIndex;
			while (end + 1 < lines.length && /^>/.test(lines[end + 1])) end++;
			const quoted = lines.slice(startLineIndex, end + 1);
			const inner = quoted.map(line => line.replace(/^> ?/, ''));
			const starts = (line: string) => list().some(t =>
				(t.type === 'element' && (t as ElementTransformer).regExp.test(line)) ||
				(t.type === 'multiline-element' && (t as MultilineElementTransformer).regExpStart.test(line)));
			if (!inner.some(line => line.trim() === '' || starts(line))) return null;
			const node = $createQuoteBlockNode();
			rootNode.append(node);
			convertFromMarkdownString(inner.join('\n'), list(), node);
			// An empty quote has nothing to hold; leave it to the plain quote.
			if (node.getChildrenSize() === 0) { node.remove(); return null; }
			return [true, end];
		},
		replace: () => false,
		export: node => ($isQuoteBlockNode(node) ? node.toMarkdown(list()) : null)
	};
	return transformer;
}
