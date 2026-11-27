/**
 * A source card: the form a saved page takes on a map (`table_map`). A picture or a title tile
 * across the top, then its title, one quote in its own words, and where it is from. Its height is
 * worked out here from its words alone, so a map can be laid out on the server before any card is
 * drawn, and the canvas gives a card the same box. `SourceCard.svelte` clamps to the same lines.
 */
import type { Block } from './tables';

export const CARD_WIDTH = 280;
/** The picture or tile: two to one. */
export const CARD_MEDIA = 140;
export const CARD_TITLE_LINES = 3;
export const CARD_QUOTE_LINES = 6;
const TITLE_LINE = 20, QUOTE_LINE = 19, META_LINE = 18, PAD = 12, GAP = 6;
/** Letters that fit a line of each, at the card's width and type sizes, erring short so nothing is cut. */
const TITLE_CHARS = 30, QUOTE_CHARS = 36;

const lines = (text: string, perLine: number, most: number) => Math.max(1, Math.min(most, Math.ceil(text.trim().length / perLine)));

export const isCard = (block: Pick<Block, 'form'>) => block.form === 'card';

export function cardSize(block: Pick<Block, 'title' | 'quote' | 'meta'>): { w: number; h: number } {
	const title = lines(block.title, TITLE_CHARS, CARD_TITLE_LINES) * TITLE_LINE;
	const quote = block.quote?.trim() ? GAP + lines(block.quote, QUOTE_CHARS, CARD_QUOTE_LINES) * QUOTE_LINE : 0;
	const meta = block.meta?.trim() ? GAP + META_LINE : 0;
	return { w: CARD_WIDTH, h: Math.ceil((CARD_MEDIA + PAD + title + quote + meta + PAD) / 20) * 20 };
}
