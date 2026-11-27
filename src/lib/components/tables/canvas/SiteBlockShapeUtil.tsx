import { useEffect, useRef } from 'react';
import { mount, unmount } from 'svelte';
import { BaseBoxShapeUtil, HTMLContainer, T, useEditor, type Editor, type TLShapeId, createShapePropsMigrationIds, createShapePropsMigrationSequence, type RecordProps, type TLShape } from 'tldraw';
import TableBlock from '../TableBlock.svelte';
import { BLOCK_SHAPE, blockHref, isBlockKind, type Block } from '$lib/tables';
import { wikiHref } from '$lib/wiki/links';
import { quoteSize } from '$lib/table-pieces';
import { cardSize, isCard } from '$lib/table-card';
import { isSocialPiece, isSourcePost, socialSize } from '$lib/table-post-source';

/** A block's props: the `Block` it shows, with '' for anything it lacks, and its size. */
export interface SiteBlockProps {
	w: number;
	h: number;
	kind: string;
	url: string;
	title: string;
	meta: string;
	excerpt: string;
	image: string;
	icon: string;
	/** Hides the block's details (its source line and kind tile), chosen by the owner for everyone. */
	hideMeta: boolean;
	/** What the block is where it was saved (`Block.ref`), or '' for none. */
	ref: string;
	/** `card` for a source card (`Block.form`), or ''. */
	form: string;
	/** A source card's quote, and whether it is Casey's own highlight. */
	quote: string;
	marked: boolean;
}

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		'site-block': SiteBlockProps;
	}
}

export type SiteBlockShape = TLShape<typeof BLOCK_SHAPE>;

export function blockOf(props: SiteBlockProps): Block {
	return {
		kind: isBlockKind(props.kind) ? props.kind : 'link',
		url: props.url,
		title: props.title,
		meta: props.meta || undefined,
		excerpt: props.excerpt || undefined,
		image: props.image || undefined,
		icon: props.icon || undefined,
		...(props.ref ? { ref: props.ref } : {}),
		...(props.form === 'card' ? { form: 'card' as const, ...(props.quote ? { quote: props.quote, ...(props.marked ? { marked: true } : {}) } : {}) } : {})
	};
}

/** Opens what a block shows in a new tab, so the table stays as it was. A cag.wiki page opens in the wiki browser. */
export function openBlock(shape: SiteBlockShape) {
	const block = blockOf(shape.props);
	window.open(new URL(wikiHref(block.url) ?? blockHref(block, location.origin), location.origin).href, '_blank', 'noopener');
}

/** The size a block starts at: covers are portrait, pictures landscape, text square. */
export function blockSize(block: Block): { w: number; h: number } {
	if (isCard(block)) return cardSize(block);
	if (block.kind === 'book') return { w: 180, h: 300 };
	if (block.kind === 'quote' && block.excerpt && !block.image) return quoteSize(block.excerpt);
	// Posts are drawn as the Bluesky or Mastodon post they are; Are.na blocks are squares with their title under them.
	if (isSourcePost(block) || isSocialPiece(block)) return socialSize(block);
	if (block.kind === 'arena') return { w: 240, h: 280 };
	if (block.image) return { w: 280, h: 240 };
	return { w: 240, h: 240 };
}

export function blockProps(block: Block): SiteBlockProps {
	return { ...blockSize(block), kind: block.kind, url: block.url, title: block.title, meta: block.meta ?? '', excerpt: block.excerpt ?? '', image: block.image ?? '', icon: block.icon ?? '', hideMeta: false, ref: block.ref ?? '', form: block.form ?? '', quote: block.quote ?? '', marked: !!block.marked };
}

const versions = createShapePropsMigrationIds(BLOCK_SHAPE, { AddHideMeta: 1, AddRef: 2, AddCard: 3 });

/** Blocks saved before details could be hidden show them. */
export const siteBlockMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddHideMeta,
			up(props: Record<string, unknown>) {
				props.hideMeta = false;
			},
			down(props: Record<string, unknown>) {
				delete props.hideMeta;
			}
		},
		{
			// Blocks saved before they kept where they came from have no ref.
			id: versions.AddRef,
			up(props: Record<string, unknown>) {
				props.ref = '';
			},
			down(props: Record<string, unknown>) {
				delete props.ref;
			}
		},
		{
			// Blocks from before source cards are whatever their kind draws.
			id: versions.AddCard,
			up(props: Record<string, unknown>) {
				props.form = '';
				props.quote = '';
				props.marked = false;
			},
			down(props: Record<string, unknown>) {
				delete props.form;
				delete props.quote;
				delete props.marked;
			}
		}
	]
});

/** How long a new social post block keeps growing to fit its post as it and its pictures load. */
const FIT_FOR_MS = 6000;
const MAX_FIT = 720;

/** Whether a block just set down should grow to fit the post it draws (see `fitToPost`). */
export const fitsToPost = (block: Block) => isSourcePost(block) || isSocialPiece(block);

/**
 * Makes a box shape `by` taller and moves what sits below it, beside the same parent, down as far,
 * so a growing post doesn't land on the blocks under it. A frame it outgrows grows the same way.
 */
export function growShape(editor: Editor, id: TLShapeId, by: number) {
	const shape = editor.getShape(id);
	if (!shape || by <= 0 || !('h' in shape.props)) return;
	const box = editor.getShapePageBounds(shape);
	if (!box) return;
	const below = editor
		.getSortedChildIdsForParent(shape.parentId)
		.map((sibling) => editor.getShape(sibling))
		.filter((sibling): sibling is NonNullable<typeof sibling> => {
			if (!sibling || sibling.id === id) return false;
			const other = editor.getShapePageBounds(sibling);
			return !!other && other.minY >= box.maxY - 1 && other.minX < box.maxX && other.maxX > box.minX;
		});
	editor.run(() => {
		editor.updateShape({ id, type: shape.type, props: { h: (shape.props as { h: number }).h + by } } as Parameters<Editor['updateShape']>[0]);
		for (const sibling of below) editor.updateShape({ id: sibling.id, type: sibling.type, y: sibling.y + by });
	});
	const parent = editor.getShape(shape.parentId as TLShapeId);
	const frame = parent?.type === 'frame' ? editor.getShapePageBounds(parent) : undefined;
	const grown = editor.getShapePageBounds(id);
	if (parent && frame && grown && grown.maxY > frame.maxY) growShape(editor, parent.id, Math.ceil(grown.maxY - frame.maxY) + 20);
}

/**
 * How tall a post's card needs to be to show all it holds: down to the bottom of its last row, plus
 * its own padding. Its scroll height won't do: the card fills its block, so that is never less than
 * the block, and a block sized by it only ever grows.
 */
export function cardHeight(card: HTMLElement): number {
	const last = card.lastElementChild;
	if (!last) return card.scrollHeight;
	const box = card.getBoundingClientRect();
	// The canvas zooms by transform, which the boxes read here include.
	const scale = card.offsetHeight ? box.height / card.offsetHeight || 1 : 1;
	const style = getComputedStyle(card);
	return Math.ceil((last.getBoundingClientRect().bottom - box.top) / scale + (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0));
}

/** Room under a post's last line, so it stays clear of the fade at the block's bottom edge. */
const FADE_ROOM = 16;

/**
 * A social post block's starting size is a guess from its excerpt; once its post has drawn, a block
 * set down in this session (`meta.fit`) grows to show all of it, then keeps whatever size it is given.
 */
function useFitToPost(shape: SiteBlockShape, target: React.RefObject<HTMLDivElement | null>) {
	const editor = useEditor();
	const fit = shape.meta?.fit === true;
	useEffect(() => {
		const root = target.current;
		if (!fit || !root || editor.getIsReadonly()) return;
		const measure = () => {
			const card = root.querySelector<HTMLElement>('.social-card');
			const current = editor.getShape<SiteBlockShape>(shape.id);
			if (!card || !current) return;
			const needed = Math.min(MAX_FIT, cardHeight(card) + FADE_ROOM);
			if (needed > current.props.h + 1) growShape(editor, shape.id, needed - current.props.h);
		};
		const resize = new ResizeObserver(measure);
		const watch = () => root.querySelectorAll('.social-post, img').forEach((element) => resize.observe(element));
		const mutations = new MutationObserver(() => {
			watch();
			measure();
		});
		mutations.observe(root, { childList: true, subtree: true });
		watch();
		measure();
		const done = setTimeout(() => {
			const current = editor.getShape(shape.id);
			if (current) editor.updateShape({ id: shape.id, type: BLOCK_SHAPE, meta: { ...current.meta, fit: false } });
		}, FIT_FOR_MS);
		return () => {
			clearTimeout(done);
			resize.disconnect();
			mutations.disconnect();
		};
	}, [editor, fit, shape.id, target]);
}

/**
 * The height a block needs to show all of itself at its width, or null when nothing in it is cut
 * off by its size: a post's whole card, or a cover or picture whole. Read from what the canvas drew.
 */
export function fullHeight(shape: SiteBlockShape, root: Element | null = document.querySelector(`.tl-shape[data-shape-id="${shape.id}"]`)): number | null {
	if (!root) return null;
	const card = root.querySelector<HTMLElement>('.social-card');
	if (card) return cardHeight(card) + FADE_ROOM;
	const picture = root.querySelector<HTMLImageElement>('.block-card .media img, .arena-block .square img');
	if (picture?.naturalWidth && picture.naturalHeight) {
		// The picture fills the block's width; whatever sits under it (a title, a caption) keeps its height.
		const box = picture.parentElement?.getBoundingClientRect();
		const block = root.querySelector<HTMLElement>('.block-card, .arena-block')?.getBoundingClientRect();
		const scale = block && block.width ? block.width / shape.props.w : 1;
		const rest = box && block ? (block.height - box.height) / scale : 0;
		return Math.ceil((shape.props.w * picture.naturalHeight) / picture.naturalWidth + rest);
	}
	return null;
}

/**
 * Double-clicking a block's corner sets it to its full size: a cropped post shows all of itself, a
 * picture its whole frame. What sits below moves down as it grows (`growShape`).
 */
export function fitToContent(editor: Editor, shape: SiteBlockShape, root?: Element | null): boolean {
	const needed = fullHeight(shape, root);
	if (!needed || Math.abs(needed - shape.props.h) < 2) return false;
	editor.markHistoryStoppingPoint('fit block');
	if (needed > shape.props.h) growShape(editor, shape.id, needed - shape.props.h);
	else editor.updateShape<SiteBlockShape>({ id: shape.id, type: BLOCK_SHAPE, props: { h: needed } });
	return true;
}

/** Renders the design system's `BlockCard` (Svelte, inside `TableBlock`, which adds its tags) in the canvas, so a block looks the same everywhere. */
function BlockCardView({ shape }: { shape: SiteBlockShape }) {
	const props = shape.props;
	const target = useRef<HTMLDivElement>(null);
	useFitToPost(shape, target);
	const { kind, url, title, meta, excerpt, image, icon, hideMeta, ref, form, quote, marked } = props;
	useEffect(() => {
		if (!target.current) return;
		const component = mount(TableBlock, { target: target.current, props: { block: blockOf({ ...props }), details: !hideMeta } });
		return () => {
			void unmount(component);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kind, url, title, meta, excerpt, image, icon, hideMeta, ref, form, quote, marked]);
	return <div ref={target} className="site-block" />;
}

export class SiteBlockShapeUtil extends BaseBoxShapeUtil<SiteBlockShape> {
	static override type = BLOCK_SHAPE;
	static override migrations = siteBlockMigrations;
	static override props: RecordProps<SiteBlockShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		kind: T.string,
		url: T.string,
		title: T.string,
		meta: T.string,
		excerpt: T.string,
		image: T.string,
		icon: T.string,
		hideMeta: T.boolean,
		ref: T.string,
		form: T.string,
		quote: T.string,
		marked: T.boolean
	};

	override getDefaultProps(): SiteBlockProps {
		return { w: 240, h: 240, kind: 'link', url: '/', title: 'Untitled', meta: '', excerpt: '', image: '', icon: '', hideMeta: false, ref: '', form: '', quote: '', marked: false };
	}

	override canEdit() {
		return false;
	}

	/** Opens the block; the empty change tells tldraw it was handled, so no text box is made. */
	override onDoubleClick(shape: SiteBlockShape) {
		openBlock(shape);
		return { id: shape.id, type: shape.type };
	}

	/** A corner's double-click fits the block to all it shows (`fitToContent`), rather than leaving it cropped. */
	override onDoubleClickCorner(shape: SiteBlockShape) {
		fitToContent(this.editor, shape);
		return { id: shape.id, type: shape.type };
	}

	/** An edge's double-click does the same. */
	override onDoubleClickEdge(shape: SiteBlockShape) {
		return this.onDoubleClickCorner(shape);
	}

	override getShapeName(shape: SiteBlockShape) {
		return shape.props.title;
	}

	override component(shape: SiteBlockShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<BlockCardView shape={shape} />
			</HTMLContainer>
		);
	}

	override getIndicatorPath(shape: SiteBlockShape) {
		const path = new Path2D();
		path.roundRect(0, 0, shape.props.w, shape.props.h, 4);
		return path;
	}
}
