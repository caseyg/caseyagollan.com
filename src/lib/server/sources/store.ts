/**
 * The Durable Object that holds the site's copy of Casey's sources: one SQLite database with the
 * index (`index.ts`), and the only thing that runs the sync (`sync.ts`), so two syncs never run at
 * once. The Worker's cron calls `tick()`; while a first sync is under way the object wakes itself
 * with an alarm until it is done.
 *
 * It has no `fetch` handler and no route: nothing outside the Worker's own code can reach it. Its
 * methods take `owner` from the caller, which must come from `sourcesFor` in `access.ts`.
 */
import { DurableObject } from 'cloudflare:workers';
import { readableMarkdown } from '../chat/fetch-page';
import { embedPending, similar, type EmbedEnv, type SimilarOptions } from './embed';
import { SourceIndex, type SearchOptions, type SearchResult, type SourceHit, type StoredDocument } from './index';
import { readPageText } from './page';
import { SOURCE_PLUGINS } from './registry';
import { fillThin, syncSource, syncStatus, type RawStore, type SyncReport } from './sync';

export interface SourceStoreEnv extends EmbedEnv {
	PUBLISHING_STATE?: R2Bucket;
	/** `true` where the cache keeps itself in sync (production). */
	SOURCES_SYNC?: string;
	[key: string]: unknown;
}

/** Seconds until the object wakes itself while a pass is under way. */
const CONTINUE_AFTER = 12;
/** Set while a sync the owner asked for is under way. */
const MANUAL = 'sync:manual';

export class SourceStore extends DurableObject<SourceStoreEnv> {
	private readonly index: SourceIndex;
	private running: Promise<SyncReport[]> | null = null;

	constructor(ctx: DurableObjectState, env: SourceStoreEnv) {
		super(ctx, env);
		this.index = new SourceIndex({ all: (query, ...params) => ctx.storage.sql.exec(query, ...(params as never[])).toArray() as never });
		this.index.migrate();
	}

	search(options: SearchOptions): SearchResult { return this.index.search(options); }
	get(wanted: string, options: { owner: boolean; source?: string; from?: number; limit?: number }): StoredDocument | null { return this.index.get(wanted, options); }
	places(options: { owner: boolean; source?: string }) { return this.index.places(options); }
	status() { return syncStatus(this.index, SOURCE_PLUGINS, this.env); }

	/** Documents like one already here, like some words, or like a picture, nearest first. */
	async similar(options: SimilarOptions): Promise<(SourceHit & { score: number })[]> { return similar(this.index, this.env, options); }

	/**
	 * A round of syncing: each source a few steps, then a few thin links' pages, then a batch of
	 * embeddings. `force` starts a pass even when one finished a moment ago.
	 */
	async tick(options: { force?: boolean } = {}): Promise<SyncReport[]> {
		// Only production syncs by itself (`SOURCES_SYNC`). Anywhere else, such as a branch preview, a sync runs
		// when the owner asks for one, and then carries on until that pass is done: every copy of the
		// site syncing on its own would spend the services' rate limits many times over.
		if (options.force) this.index.setState(MANUAL, true);
		if (this.env.SOURCES_SYNC !== 'true' && !this.index.state<boolean>(MANUAL)) return [];
		// One round at a time; a second caller gets the round under way.
		this.running ??= this.round(options.force === true).finally(() => { this.running = null; });
		return this.running;
	}

	private async round(force: boolean): Promise<SyncReport[]> {
		const context = { env: this.env, fetcher: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch, now: () => new Date(), markdown: readableMarkdown };
		const raw = this.env.PUBLISHING_STATE as RawStore | undefined;
		const reports: SyncReport[] = [];
		for (const plugin of SOURCE_PLUGINS) {
			const report = await syncSource(plugin, { index: this.index, context, raw, everyMinutes: force ? 0 : 10 });
			reports.push(report);
			// Counts only: a title or an address in a log would be Casey's private reading.
			if (!report.skipped) console.log(JSON.stringify({ event: 'source_sync', ...report }));
		}
		const filled = await fillThin(this.index, (url) => readPageText(url)).catch(() => ({ read: 0, filled: 0 }));
		const embedded = await embedPending(this.index, this.env).catch(() => ({ text: 0, images: 0, left: false }));
		if (filled.read || embedded.text || embedded.images) console.log(JSON.stringify({ event: 'source_enrich', pages: filled.read, filled: filled.filled, embedded: embedded.text, images: embedded.images }));
		const unfinished = reports.some((report) => !report.done && !report.failed) || filled.read > 0 || embedded.left;
		const busy = Math.max(0, ...reports.map((report) => report.busy ?? 0));
		if (unfinished || busy) await this.ctx.storage.setAlarm(Date.now() + Math.max(busy, CONTINUE_AFTER) * 1000);
		else this.index.setState(MANUAL, false);
		return reports;
	}

	async alarm(): Promise<void> {
		await this.tick();
	}
}
