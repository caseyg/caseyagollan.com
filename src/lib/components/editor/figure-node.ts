import { $applyNodeReplacement, DecoratorNode, type EditorConfig, type LexicalEditor, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { MultilineElementTransformer } from '@lexical/markdown';
import { isFigureStart, isImageLine, parseFigure, parseImage, serializeFigure, serializeImage, type Figure } from '$lib/markdown-figure';
import FigureBlock from './FigureBlock.svelte';

/** `figure` is `<figure>` HTML; `image` is a Markdown image on its own line. */
export type FigureKind = 'figure' | 'image';
type SerializedFigureNode = Spread<{ figure: Figure; source: string | null; kind?: FigureKind }, SerializedLexicalNode>;

/**
 * A figure in the rich editor. It keeps the exact source it was read from until
 * it is edited, so untouched figures are written back byte for byte.
 */
export class FigureNode extends DecoratorNode<unknown> {
	__figure: Figure;
	__source: string | null;
	__kind: FigureKind;

	static getType() { return 'figure'; }
	static clone(node: FigureNode) { return new FigureNode(node.__figure, node.__source, node.__kind, node.__key); }
	static importJSON(json: SerializedFigureNode) { return $createFigureNode(json.figure, json.source, json.kind); }

	constructor(figure: Figure, source: string | null = null, kind: FigureKind = 'figure', key?: NodeKey) {
		super(key);
		this.__figure = figure;
		this.__source = source;
		this.__kind = kind;
	}

	exportJSON(): SerializedFigureNode {
		return { ...super.exportJSON(), type: 'figure', version: 1, figure: this.__figure, source: this.__source, kind: this.__kind };
	}

	createDOM(): HTMLElement {
		const element = document.createElement('div');
		element.className = 'md-figure';
		return element;
	}

	updateDOM() { return false; }
	isInline() { return false; }
	isKeyboardSelectable() { return true; }

	getFigure(): Figure { return this.getLatest().__figure; }

	setFigure(changes: Partial<Figure>): this {
		const writable = this.getWritable();
		writable.__figure = { ...writable.__figure, ...changes };
		writable.__source = null;
		return writable;
	}

	toMarkdown(): string {
		const latest = this.getLatest();
		return latest.__source ?? (latest.__kind === 'image' ? serializeImage(latest.__figure) : serializeFigure(latest.__figure));
	}

	getTextContent() { return this.getLatest().__figure.alt; }

	decorate(_editor: LexicalEditor, _config: EditorConfig) {
		return {
			componentClass: FigureBlock,
			updateProps: (props: Record<string, unknown>) => {
				props.nodeKey = this.__key;
				props.figure = this.__figure;
				props.kind = this.__kind;
			}
		};
	}
}

export function $createFigureNode(figure: Figure, source: string | null = null, kind: FigureKind = 'figure'): FigureNode {
	return $applyNodeReplacement(new FigureNode(figure, source, kind));
}

export function $isFigureNode(node: LexicalNode | null | undefined): node is FigureNode {
	return node instanceof FigureNode;
}

/** Reads a figure that starts a line and ends on that line or a later one. */
export const FIGURE: MultilineElementTransformer = {
	type: 'multiline-element',
	dependencies: [FigureNode],
	regExpStart: /^<figure[\s>]/,
	regExpEnd: /<\/figure>\s*$/,
	handleImportAfterStartMatch({ lines, rootNode, startLineIndex }) {
		if (!isFigureStart(lines[startLineIndex])) return null;
		for (let end = startLineIndex; end < lines.length; end++) {
			if (!/<\/figure>\s*$/.test(lines[end])) continue;
			const source = lines.slice(startLineIndex, end + 1).join('\n');
			const figure = parseFigure(source);
			if (!figure) return null;
			rootNode.append($createFigureNode(figure, source));
			return [true, end];
		}
		return null;
	},
	replace: () => false,
	export: node => ($isFigureNode(node) ? node.toMarkdown() : null)
};

/** Reads a Markdown image that is a line of its own into an image block. */
export const IMAGE: MultilineElementTransformer = {
	type: 'multiline-element',
	dependencies: [FigureNode],
	regExpStart: /^!\[/,
	handleImportAfterStartMatch({ lines, rootNode, startLineIndex }) {
		const line = lines[startLineIndex];
		if (!isImageLine(line)) return null;
		const figure = parseImage(line);
		if (!figure) return null;
		rootNode.append($createFigureNode(figure, line.trim(), 'image'));
		return [true, startLineIndex];
	},
	replace: () => false,
	export: () => null
};
