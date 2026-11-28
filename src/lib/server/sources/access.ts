/**
 * The one way the rest of the site reads the cache. `sourcesFor` binds who is reading into every
 * call, so a caller can't forget to say, and can't say `owner` by passing a parameter along from a
 * request: it has to have decided who the reader is first.
 *
 * Rules, which `tests/sources-privacy.test.ts` holds to:
 * - `owner: true` only for the signed-in owner (the passkey session, or a chat run that is Casey's
 *   alone). Everyone else gets what the plugins marked public, and no places or tags.
 * - Nothing here is served to a browser except by `/api/sources`, which refuses anyone but the owner.
 * - What a table or a post shows of a cached document is copied into it (`sourceBlock`): the title,
 *   an excerpt, the address and the picture. Nothing public points back into the cache.
 */
import type { Block } from '../../tables';
import { alike, readPending, similar, READ_USAGE, type AlikeOptions, type EmbedEnv, type ReadUsage, type SimilarOptions } from './embed';
import type { SearchOptions, SearchResult, SourceHit, SourceIndex, StoredDocument } from './index';
import { SOURCE_PLUGINS, sourcePlugin } from './registry';
import { syncStatus, type SyncReport } from './sync';
import type { PictureReading, SourceStatus } from '../../source-status';

/** What holds the index: the `SourceStore` Durable Object in the Worker, a local database in tests and replays. */
export interface SourceBackend {
	search(options: SearchOptions): Promise<SearchResult> | SearchResult;
	get(wanted: string, options: { owner: boolean; source?: string; from?: number; limit?: number }): Promise<StoredDocument | null> | StoredDocument | null;
	places(options: { owner: boolean; source?: string }): Promise<{ source: string; place: string; count: number }[]> | { source: string; place: string; count: number }[];
	similar(options: SimilarOptions): Promise<(SourceHit & { score?: number })[]>;
	alike(options: AlikeOptions): Promise<(SourceHit & { score?: number })[]>;
	status(): Promise<SourceStatus[]> | SourceStatus[];
	/** How far reading the words in pictures has got. */
	pictures(): Promise<PictureReading> | PictureReading;
	/** Has up to `count` more stored pictures read (0 stops). */
	readPictures(count: number): Promise<PictureReading>;
	tick(options?: { force?: boolean }): Promise<SyncReport[]>;
}

export type { SourceStatus } from '../../source-status';

export interface SourcesEnv { SOURCES?: { idFromName(name: string): unknown; get(id: never): unknown } }

/** The cache as one reader sees it. */
export interface Sources {
	readonly owner: boolean;
	search(options: Omit<SearchOptions, 'owner'>): Promise<SearchResult>;
	get(wanted: string, options?: { source?: string; from?: number; limit?: number }): Promise<StoredDocument | null>;
	places(source?: string): Promise<{ source: string; place: string; count: number }[]>;
	similar(options: Omit<SimilarOptions, 'owner'>): Promise<(SourceHit & { score?: number })[]>;
	/** What is like several things at once: blocks, words, pictures. */
	alike(options: Omit<AlikeOptions, 'owner'>): Promise<(SourceHit & { score?: number })[]>;
}

/** The Durable Object behind the binding, or null where there is none (the dev server, a preview from before it existed). */
export function sourceBackend(env: SourcesEnv | undefined): SourceBackend | null {
	const namespace = env?.SOURCES;
	return namespace ? (namespace.get(namespace.idFromName('main') as never) as SourceBackend) : null;
}

const picturesOf = (index: SourceIndex): PictureReading => ({ ...index.pictureCounts(), asked: 0, usage: index.state<ReadUsage>(READ_USAGE) ?? { pictures: 0, input: 0, output: 0 }, recent: index.recentImageText(20) });

/** A database in this process as a backend: for tests and the chat replay. */
export function localBackend(index: SourceIndex, env: EmbedEnv & Record<string, unknown> = {}): SourceBackend {
	return {
		search: (options) => index.search(options), get: (wanted, options) => index.get(wanted, options), places: (options) => index.places(options),
		similar: (options) => similar(index, env, options), alike: (options) => alike(index, env, options), status: () => syncStatus(index, SOURCE_PLUGINS, env), tick: async () => [],
		pictures: () => picturesOf(index), readPictures: async (count) => { await readPending(index, env, count); return picturesOf(index); }
	};
}

/** Binds the reader. `owner` must already have been established by the caller (a session check, or an owner-only chat run). */
export function sourcesFor(backend: SourceBackend | null, reader: { owner: boolean }): Sources | null {
	if (!backend) return null;
	const owner = reader.owner === true;
	return {
		owner,
		search: async (options) => backend.search({ ...options, owner }),
		get: async (wanted, options = {}) => backend.get(wanted, { ...options, owner }),
		places: async (source) => backend.places({ owner, source }),
		similar: async (options) => backend.similar({ ...options, owner }),
		alike: async (options) => backend.alike({ ...options, owner })
	};
}

const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);

/**
 * What goes on a table for a cached document: a copy of the few things a card shows. The block
 * holds no key into the cache and none of the document's text beyond the excerpt, so publishing
 * the table publishes exactly this. A private document's card says so.
 */
export function sourceBlock(hit: SourceHit): Block {
	const plugin = sourcePlugin(hit.source);
	const excerpt = hit.excerpt ? clip(hit.excerpt, 300) : undefined;
	const meta = [hit.private && hit.source === 'arena' ? 'Private' : null, plugin?.name ?? hit.source, hit.site, hit.date].filter(Boolean).join(' · ');
	return {
		kind: hit.source === 'arena' ? 'arena' : hit.source === 'raindrop' ? 'raindrop' : 'link',
		url: hit.source === 'arena' ? hit.openUrl ?? hit.url : hit.url, title: hit.title, meta, ...(excerpt ? { excerpt } : {}), ...(hit.image ? { image: hit.image } : {}),
		icon: plugin?.icon ?? '🔗', ...(hit.ref ? { ref: hit.ref } : {})
	};
}
