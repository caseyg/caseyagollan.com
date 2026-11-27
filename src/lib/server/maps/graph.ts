/**
 * The last stage of a map: every document as the block it draws as, with the box it needs, and
 * the whole set laid out as a network (`graphLayout`). What comes out is everything the canvas
 * needs to draw the map in one change: cards with their places, and ties by tier.
 */
import { graphLayout } from '../../table-graph';
import { cardSize } from '../../table-card';
import { quoteSize } from '../../table-pieces';
import { isSourcePost, socialSize } from '../../table-post-source';
import type { Block } from '../../tables';
import { hostOf } from './text';
import type { GraphStage, ImagesStage, MapDoc, MapEdge, QuotesStage } from './types';

const ICON: Record<string, string> = { readwise: '📖', raindrop: '💧' };
const KIND_ICON: Record<string, string> = { video: '🎬', pdf: '📄', tweet: '🐦', podcast: '🎧', epub: '📚', email: '✉️' };

/** A document as a block: its own where its source draws it its own way, else a source card. */
export function blockFor(doc: MapDoc, quotes: QuotesStage['quotes'], images: ImagesStage['images']): Block {
	if (doc.block) return doc.block;
	const quote = quotes[doc.id];
	const site = doc.site || hostOf(doc.url);
	return {
		kind: doc.source === 'raindrop' ? 'raindrop' : doc.source === 'site' ? 'post' : 'link',
		url: doc.source === 'site' ? doc.open ?? doc.url : doc.url,
		title: doc.title.slice(0, 300),
		meta: [site, doc.author && doc.author.toLowerCase() !== site.toLowerCase() ? doc.author : ''].filter(Boolean).join(' · ').slice(0, 200),
		form: 'card',
		...(quote ? { quote: quote.text, ...(quote.from === 'highlight' ? { marked: true } : {}) } : {}),
		...(images[doc.id] ? { image: images[doc.id]!.src } : {}),
		icon: KIND_ICON[doc.kind ?? ''] ?? ICON[doc.source],
		...(doc.ref ? { ref: doc.ref } : {})
	};
}

/** The box a block starts at on the canvas (as `blockSize` gives it there), from what the server knows. */
export function boxFor(block: Block): { w: number; h: number } {
	if (block.form === 'card') return cardSize(block);
	if (block.kind === 'quote' && block.excerpt && !block.image) return quoteSize(block.excerpt);
	if (isSourcePost(block)) return socialSize(block);
	if (block.kind === 'arena') return { w: 240, h: 280 };
	return block.image ? { w: 280, h: 240 } : { w: 240, h: 240 };
}

export interface GraphOptions { spread?: number; seeds?: number }

export function buildGraph(docs: MapDoc[], edges: MapEdge[], quotes: QuotesStage['quotes'], images: ImagesStage['images'], options: GraphOptions = {}): GraphStage {
	const blocks = docs.map((doc) => blockFor(doc, quotes, images));
	const boxes = docs.map((doc, index) => ({ id: doc.id, x: 0, y: 0, ...boxFor(blocks[index]) }));
	const index = new Map(docs.map((doc, at) => [doc.id, at]));
	const within = edges.filter((edge) => index.has(edge.from) && index.has(edge.to));
	const gap = 40;
	const laid = graphLayout(boxes, within.map((edge) => ({ from: edge.from, to: edge.to, weight: edge.strong ? 1 : edge.weight })), { gap, spread: Math.round(gap * 3 * Math.max(0.5, Math.min(2.5, options.spread ?? 1))), seeds: options.seeds });
	const cards = docs.map((doc, at) => ({ id: doc.id, block: blocks[at], ...laid.spots.get(doc.id)!, w: boxes[at].w, h: boxes[at].h }));
	return {
		cards,
		// Likeness first, so the backbone is drawn over it.
		links: within.toSorted((a, b) => Number(a.strong) - Number(b.strong)).map((edge) => ({ from: index.get(edge.from)!, to: index.get(edge.to)!, strong: edge.strong, ...(edge.kind === 'cites' || edge.kind === 'same' ? { label: edge.label } : {}) })),
		width: Math.max(0, ...cards.map((card) => card.x + card.w)), height: Math.max(0, ...cards.map((card) => card.y + card.h)),
		crossings: laid.crossings, seed: laid.seed
	};
}
