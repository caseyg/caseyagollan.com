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
/** Set until the round a forced sync asked for has begun. */
const FORCED = 'sync:forced';
/** Seconds between rounds of a pass that has more to fetch and isn't being asked to wait. */
const NEXT_AFTER = 1;
/** What the round under way is doing, so a round that never finished (out of memory, most likely) says where it stopped. */
const DOING = 'round:doing';
/** Seconds between rounds that only read pages and work out likeness: unhurried, so memory is given back in between. */
const ENRICH_AFTER = 4;

export class SourceStore extends DurableObject<SourceStoreEnv> {
	private readonly index: SourceIndex;

	constructor(ctx: DurableObjectState, env: SourceStoreEnv) {
		super(ctx, env);
		this.index = new SourceIndex({ all: (query, ...params) => ctx.storage.sql.exec(query, ...(params as never[])).toArray() as never });
		this.index.migrate();
	}

	search(options: SearchOptions): SearchResult { return this.index.search(options); }
	get(wanted: string, options: { owner: boolean; source?: string; from?: number; limit?: number }): StoredDocument | null { return this.index.get(wanted, options); }
	places(options: { owner: boolean; source?: string }) { return this.index.places(options); }
	status() {
		// A sync just asked for hasn't begun its first step yet: say so, so the settings page keeps watching.
		const asked = this.index.state<boolean>(FORCED) === true;
		return syncStatus(this.index, SOURCE_PLUGINS, this.env).map((entry) => (asked && entry.configured ? { ...entry, syncing: true } : entry));
	}

	/** Documents like one already here, like some words, or like a picture, nearest first. */
	async similar(options: SimilarOptions): Promise<(SourceHit & { score: number })[]> { return similar(this.index, this.env, options); }

	/**
	 * Asks for syncing to carry on. The work itself is done in the object's alarm, never in this
	 * call: a caller that goes away (a request that has answered, a cron run that has ended) takes
	 * its call's work with it, which once left a first copy stuck after one page.
	 * `force` starts a pass even when one finished a moment ago.
	 */
	async tick(options: { force?: boolean } = {}): Promise<SyncReport[]> {
		// Only production syncs by itself (`SOURCES_SYNC`). Anywhere else, such as a branch preview, a sync runs
		// when the owner asks for one, and then carries on until that pass is done: every copy of the
		// site syncing on its own would spend the services' rate limits many times over.
		if (options.force) { this.index.setState(MANUAL, true); this.index.setState(FORCED, true); }
		if (this.env.SOURCES_SYNC !== 'true' && !this.index.state<boolean>(MANUAL)) return [];
		const due = await this.ctx.storage.getAlarm();
		if (options.force || due === null) await this.ctx.storage.setAlarm(Date.now() + 100);
		return [];
	}

	private async round(force: boolean): Promise<SyncReport[]> {
		const context = { env: this.env, fetcher: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch, now: () => new Date(), markdown: readableMarkdown };
		const raw = this.env.PUBLISHING_STATE as RawStore | undefined;
		const reports: SyncReport[] = [];
		for (const plugin of SOURCE_PLUGINS) {
			this.index.setState(DOING, `sync:${plugin.id}`);
			// One source's trouble is its own: the others still get their turn.
			const report = await syncSource(plugin, { index: this.index, context, raw, everyMinutes: force ? 0 : 10, budgetMs: 12_000, maxSteps: 1 }).catch((error): SyncReport => {
				console.error(JSON.stringify({ event: 'source_sync_failed', source: plugin.id, error: (error as Error)?.name, message: String((error as Error)?.message ?? '').slice(0, 160) }));
				return { source: plugin.id, steps: 0, added: 0, changed: 0, removed: 0, done: false, failed: true };
			});
			reports.push(report);
			// Counts only: a title or an address in a log would be Casey's private reading.
			if (!report.skipped) console.log(JSON.stringify({ event: 'source_sync', ...report }));
		}
		const fetching = reports.some((report) => !report.done && !report.failed && !report.busy);
		// Pages and likeness wait until every source has what it can fetch for now: the copy itself comes first, and
		// the two kinds of work never share the Worker's memory in one round.
		this.index.setState(DOING, 'pages');
		const filled = fetching ? { read: 0, filled: 0 } : await fillThin(this.index, (url) => readPageText(url)).catch(() => ({ read: 0, filled: 0 }));
		this.index.setState(DOING, 'likeness');
		const embedded = fetching ? { text: 0, images: 0, left: true } : await embedPending(this.index, this.env).catch(() => ({ text: 0, images: 0, left: false }));
		if (filled.read || embedded.text || embedded.images) console.log(JSON.stringify({ event: 'source_enrich', pages: filled.read, filled: filled.filled, embedded: embedded.text, images: embedded.images }));
		// Carry on at once while any source has more to fetch and isn't waiting on its service; otherwise when the shortest wait is over.
		const enriching = filled.read > 0 || embedded.left;
		const waits = reports.filter((report) => !report.done).map((report) => report.busy ?? (report.failed ? 60 : 0)).filter((seconds) => seconds > 0);
		if (fetching) await this.ctx.storage.setAlarm(Date.now() + NEXT_AFTER * 1000);
		else if (enriching) await this.ctx.storage.setAlarm(Date.now() + ENRICH_AFTER * 1000);
		else if (waits.length) await this.ctx.storage.setAlarm(Date.now() + Math.max(Math.min(...waits), CONTINUE_AFTER) * 1000);
		else this.index.setState(MANUAL, false);
		return reports;
	}

	/** A round of syncing: each source a few steps, then a few thin links' pages, then a batch of embeddings. Alarms never overlap, so neither do rounds. */
	async alarm(): Promise<void> {
		if (this.env.SOURCES_SYNC !== 'true' && !this.index.state<boolean>(MANUAL)) return;
		const force = this.index.state<boolean>(FORCED) === true;
		if (force) this.index.setState(FORCED, false);
		const died = this.index.state<string>(DOING);
		if (died) console.error(JSON.stringify({ event: 'source_round_died', during: died }));
		try {
			await this.round(force);
			this.index.setState(DOING, '');
		} catch (error) {
			// Never the words of a document: the kind of error, and its opening.
			console.error(JSON.stringify({ event: 'source_round_failed', error: (error as Error)?.name, message: String((error as Error)?.message ?? '').slice(0, 160) }));
			await this.ctx.storage.setAlarm(Date.now() + 60_000);
		}
	}
}
