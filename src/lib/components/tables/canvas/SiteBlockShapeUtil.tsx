import { useEffect, useRef } from 'react';
import { mount, unmount } from 'svelte';
import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw';
import BlockCard from '../BlockCard.svelte';
import { BlockSvg, pictureData } from './block-svg';
import { BLOCK_SHAPE, blockHref, isBlockKind, type Block } from '$lib/tables';
import { wikiHref } from '$lib/wiki/links';
import { quoteSize } from '$lib/table-pieces';

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
		icon: props.icon || undefined
	};
}

/** Opens what a block shows in a new tab, so the table stays as it was. A cag.wiki page opens in the wiki browser. */
export function openBlock(shape: SiteBlockShape) {
	const block = blockOf(shape.props);
	window.open(new URL(wikiHref(block.url) ?? blockHref(block, location.origin), location.origin).href, '_blank', 'noopener');
}

/** The size a block starts at: covers are portrait, pictures landscape, text square. */
export function blockSize(block: Block): { w: number; h: number } {
	if (block.kind === 'book') return { w: 180, h: 300 };
	if (block.kind === 'quote' && block.excerpt && !block.image) return quoteSize(block.excerpt);
	if (block.image) return { w: 280, h: 240 };
	return { w: 240, h: 240 };
}

export function blockProps(block: Block): SiteBlockProps {
	return { ...blockSize(block), kind: block.kind, url: block.url, title: block.title, meta: block.meta ?? '', excerpt: block.excerpt ?? '', image: block.image ?? '', icon: block.icon ?? '' };
}

/** Renders the design system's `BlockCard` (Svelte) inside the canvas, so a block looks the same everywhere. */
function BlockCardView({ props }: { props: SiteBlockProps }) {
	const target = useRef<HTMLDivElement>(null);
	const { kind, url, title, meta, excerpt, image, icon } = props;
	useEffect(() => {
		if (!target.current) return;
		const component = mount(BlockCard, { target: target.current, props: { block: blockOf({ ...props }) } });
		return () => {
			void unmount(component);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kind, url, title, meta, excerpt, image, icon]);
	return <div ref={target} className="site-block" />;
}

export class SiteBlockShapeUtil extends BaseBoxShapeUtil<SiteBlockShape> {
	static override type = BLOCK_SHAPE;
	static override props: RecordProps<SiteBlockShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		kind: T.string,
		url: T.string,
		title: T.string,
		meta: T.string,
		excerpt: T.string,
		image: T.string,
		icon: T.string
	};

	override getDefaultProps(): SiteBlockProps {
		return { w: 240, h: 240, kind: 'link', url: '/', title: 'Untitled', meta: '', excerpt: '', image: '', icon: '' };
	}

	override canEdit() {
		return false;
	}

	/** Opens the block; the empty change tells tldraw it was handled, so no text box is made. */
	override onDoubleClick(shape: SiteBlockShape) {
		openBlock(shape);
		return { id: shape.id, type: shape.type };
	}

	/** How the block appears in exports, such as the table's picture on the browse page. */
	override async toSvg(shape: SiteBlockShape) {
		const block = blockOf(shape.props);
		const picture = block.image ? await pictureData(block.image, Math.min(400, shape.props.w * 2)) : null;
		return <BlockSvg block={block} w={shape.props.w} h={shape.props.h} picture={picture} />;
	}

	override getShapeName(shape: SiteBlockShape) {
		return shape.props.title;
	}

	override component(shape: SiteBlockShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<BlockCardView props={shape.props} />
			</HTMLContainer>
		);
	}

	override getIndicatorPath(shape: SiteBlockShape) {
		const path = new Path2D();
		path.roundRect(0, 0, shape.props.w, shape.props.h, 4);
		return path;
	}
}
