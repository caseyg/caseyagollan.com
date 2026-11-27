/**
 * The shapes a map passes between its stages. Each stage reads the one before it and writes one
 * JSON file (docs, links, quotes, graph), so a stage can be re-run without the rest.
 */
import type { Block } from '../../tables';

export const MAP_SOURCES = ['readwise', 'arena', 'raindrop', 'site'] as const;
export type MapSource = (typeof MAP_SOURCES)[number];
export const MAP_SOURCE_NAME: Record<MapSource, string> = { readwise: 'Readwise', arena: 'Are.na', raindrop: 'Raindrop', site: 'This site' };

/** One place to take documents from: a source, and optionally a place in it or words to match. */
export interface MapAsk { source: MapSource; in?: string; query?: string }

/** A saved thing with everything later stages need: its words, what it links to, its pictures, Casey's highlights. */
export interface MapDoc {
	/** `<source>:<id>`: the same thing keeps its id from run to run. */
	id: string;
	source: MapSource;
	/** The page itself, on the web. */
	url: string;
	/** Where a card opens when that isn't the page (an Are.na block). */
	open?: string;
	title: string;
	site: string;
	author?: string;
	/** When Casey saved it, YYYY-MM-DD. */
	date?: string;
	kind?: string;
	/** The main text, as Markdown, cut to a reading length. */
	text: string;
	/** Every address the text links to, as written. */
	links: string[];
	/** Pictures to try, best first. */
	images: string[];
	/** Casey's own highlights of it, in the order made. */
	highlights: string[];
	ref?: string;
	private?: boolean;
	/** The block the source itself would put on a table, for sources drawn their own way (Are.na, the site's posts). */
	block?: Block;
	/** Whether the page has been read to fill in thin text, links or pictures (once is enough). */
	filled?: boolean;
	updated?: string;
}

export interface DocsStage { asks: MapAsk[]; days?: number; fetched: string; docs: MapDoc[]; notes: string[] }

export type EdgeKind = 'link' | 'cites' | 'same' | 'similar' | 'site';
/** A tie between two documents. `strong` ties are facts (a link, a shared citation); the rest are likeness. */
export interface MapEdge { from: string; to: string; kind: EdgeKind; strong: boolean; weight: number; label?: string; via?: string }
export interface LinksStage { edges: MapEdge[]; citations: { url: string; by: string[] }[]; languages: Record<string, number> }

export interface MapQuote { text: string; from: 'highlight' | 'model' | 'rule' }
export interface QuotesStage { quotes: Record<string, MapQuote | null> }

export interface MapImage { src: string; from: string }
export interface ImagesStage { images: Record<string, MapImage | null>; kept: number; tiles: number; people: number; unchecked: number }

export interface MapCard { id: string; block: Block; x: number; y: number; w: number; h: number }
export interface GraphStage { cards: MapCard[]; links: { from: number; to: number; strong: boolean; label?: string }[]; width: number; height: number; crossings: number; seed: number }
