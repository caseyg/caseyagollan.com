/**
 * Runs the plugins: a few bounded steps at a time, so a first sync of thousands of documents is
 * spread over many short runs and a later one is a request or two. Between steps everything a
 * plugin needs is in the index's `state` table, so a run that is cut off loses one step at most.
 *
 * Each document is kept twice: whole, as the service sent it, in the private bucket under
 * `private/sources/<source>/<id>.json` (only the Worker can read it; nothing serves it), and
 * normalized in the index for search.
 */
import type { SourceIndex } from './index';
import { SourceBusy, type SourcePlugin, type SyncContext, type SyncState } from './types';

/** The least of an R2 bucket this needs. */
export interface RawStore { put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }

export interface SyncDeps {
	index: SourceIndex;
	context: SyncContext;
	/** Where whole records are kept; without it only the index is filled. */
	raw?: RawStore;
	/** Milliseconds one run may take for one source. */
	budgetMs?: number;
	/** Steps one run may take for one source. */
	maxSteps?: number;
	/** Minutes between passes of one source. */
	everyMinutes?: number;
}

export interface SyncReport {
	source: string;
	steps: number;
	added: number;
	changed: number;
	removed: number;
	/** The pass under way is finished (or none was due). */
	done: boolean;
	/** Seconds the service asked the sync to wait. */
	busy?: number;
	failed?: boolean;
	skipped?: 'not-configured' | 'not-due';
}

interface Kept extends SyncState {
	/** ISO time the pass under way started. */
	started?: string;
	/** ISO time the last pass finished. */
	finished?: string;
	/** Failed steps in a row. */
	failures?: number;
}

export const rawKey = (source: string, id: string) => `private/sources/${source}/${id.replace(/[^\w.:-]+/g, '_').replace(/\.{2,}/g, '_')}.json`;
export const syncKey = (source: string) => `sync:${source}`;

async function keepRaw(store: RawStore, items: { key: string; raw: unknown }[]): Promise<void> {
	// A few at a time: a step holds up to a hundred records.
	for (let start = 0; start < items.length; start += 10) {
		await Promise.all(items.slice(start, start + 10).map(({ key, raw }) => store.put(key, JSON.stringify(raw), { httpMetadata: { contentType: 'application/json' } })));
	}
}

/** One source, as far as the budget allows. Never throws: what went wrong is in the report, and never the service's words. */
export async function syncSource(plugin: SourcePlugin, deps: SyncDeps): Promise<SyncReport> {
	const { index, context } = deps;
	const report: SyncReport = { source: plugin.id, steps: 0, added: 0, changed: 0, removed: 0, done: true };
	if (!plugin.configured(context.env)) return { ...report, skipped: 'not-configured' };
	const kept = index.state<Kept>(syncKey(plugin.id)) ?? {};
	const now = context.now();
	if (!kept.cursor && kept.finished && now.getTime() - Date.parse(kept.finished) < (deps.everyMinutes ?? 15) * 60_000) return { ...report, skipped: 'not-due' };
	const state: Kept = { ...kept, started: kept.cursor ? kept.started ?? now.toISOString() : now.toISOString() };
	if (!kept.cursor) delete state.cursor;
	const until = Date.now() + (deps.budgetMs ?? 20_000);
	report.done = false;
	while (report.steps < (deps.maxSteps ?? 4) && Date.now() < until) {
		let step;
		try {
			step = await plugin.sync(context, { cursor: state.cursor, since: state.since, full: state.full });
		} catch (error) {
			if (error instanceof SourceBusy) report.busy = error.retryAfter;
			else {
				report.failed = true;
				state.failures = (state.failures ?? 0) + 1;
				// A pass that keeps failing at the same place is given up, to start again when next due.
				if (state.failures >= 5) { delete state.cursor; state.finished = now.toISOString(); state.failures = 0; report.done = true; }
			}
			break;
		}
		report.steps++;
		state.failures = 0;
		const stamp = context.now().toISOString();
		const counts = index.upsert(step.documents.map(({ document, keepPlaces }) => ({ ...document, keepPlaces })), stamp);
		report.added += counts.added;
		report.changed += counts.changed;
		if (step.highlights?.length) index.upsertHighlights(step.highlights, plugin.id);
		if (step.removedHighlights?.length) index.removeHighlights(plugin.id, step.removedHighlights);
		for (const place of step.places ?? []) index.setPlace(plugin.id, place.place, place.ids);
		if (step.removed?.length) report.removed += index.remove(plugin.id, step.removed).length;
		if (deps.raw) {
			await keepRaw(deps.raw, [
				...step.documents.filter((record) => record.raw !== undefined).map((record) => ({ key: rawKey(plugin.id, record.document.id), raw: record.raw })),
				...(step.highlights ?? []).filter((highlight) => highlight.raw !== undefined).map((highlight) => ({ key: rawKey(plugin.id, `highlights/${highlight.id}`), raw: highlight.raw }))
			]);
		}
		if (step.done) {
			if (step.complete) { report.removed += index.removeUnseen(plugin.id, state.started!).length; state.full = state.started; }
			state.since = state.started;
			state.finished = context.now().toISOString();
			delete state.cursor;
			delete state.started;
			report.done = true;
			index.setState(syncKey(plugin.id), state);
			break;
		}
		state.cursor = step.cursor;
		// After every step, so a run that is cut off carries on from here.
		index.setState(syncKey(plugin.id), state);
	}
	if (report.failed || report.busy) index.setState(syncKey(plugin.id), state);
	return report;
}

export interface PageText { text: string; links?: string[]; image?: string }

/**
 * Reads the pages of links that came with few words of their own (a Raindrop bookmark, an Are.na
 * link block) and keeps their text. Each is tried once; a page that can't be read stays thin.
 */
export async function fillThin(index: SourceIndex, read: (url: string) => Promise<PageText | null>, limit = 6): Promise<{ read: number; filled: number }> {
	const thin = index.thin(limit);
	let filled = 0;
	await Promise.all(thin.map(async ({ key, url }) => {
		const page = await read(url).catch(() => null);
		index.fill(key, page);
		if (page?.text) filled++;
	}));
	return { read: thin.length, filled };
}

/** Where each source's sync stands, for the owner's settings. */
export function syncStatus(index: SourceIndex, plugins: SourcePlugin[], env: Record<string, unknown>) {
	const stats = new Map(index.stats().map((entry) => [entry.source, entry]));
	return plugins.map((plugin) => {
		const kept = index.state<Kept>(syncKey(plugin.id)) ?? {};
		const entry = stats.get(plugin.id);
		return {
			source: plugin.id, name: plugin.name, icon: plugin.icon, configured: plugin.configured(env), documents: entry?.documents ?? 0, private: entry?.private ?? 0, highlights: entry?.highlights ?? 0,
			withText: entry?.withText ?? 0, ...(entry?.newest ? { newest: entry.newest } : {}), ...(kept.finished ? { synced: kept.finished } : {}), syncing: !!kept.cursor, everything: !!kept.since
		};
	});
}
