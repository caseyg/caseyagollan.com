/**
 * A block's shape props and starting size, apart from the canvas: the browser's shape
 * (`SiteBlockShapeUtil`) and the server's changes to a saved table (`table-document.ts`) share them.
 */
import type { Block } from './tables';
import { quoteSize } from './table-pieces';
import { cardSize, isCard } from './table-card';
import { isSocialPiece, isSourcePost, socialSize } from './table-post-source';

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

/** Whether a block just set down should grow to fit the post it draws (see `fitToPost`). */
export const fitsToPost = (block: Block) => isSourcePost(block) || isSocialPiece(block);
