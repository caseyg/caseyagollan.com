/**
 * Fills a local copy of the source cache from the real services and searches it, outside the
 * Worker: `bun utils/sources/try.ts sync [source] [steps]`, `… search <words>`, `… get <key>`,
 * `… status`. The database is `.sources/index.sqlite` (ignored by git); raw records go beside it.
 * Needs the same tokens the Worker has, in the environment.
 */
import { Database } from 'bun:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readableMarkdown } from '../../src/lib/server/chat/fetch-page';
import { SourceIndex, type Sql } from '../../src/lib/server/sources/index';
import { SOURCE_PLUGINS } from '../../src/lib/server/sources/registry';
import { syncSource, syncStatus } from '../../src/lib/server/sources/sync';

export function localIndex(path = '.sources/index.sqlite'): SourceIndex {
	const database = new Database(path, { create: true });
	database.exec('PRAGMA journal_mode = WAL');
	const sql: Sql = { all: (query, ...params) => database.query(query).all(...(params as never[])) as never };
	const index = new SourceIndex(sql);
	index.migrate();
	return index;
}

if (import.meta.main) {
	await mkdir('.sources/raw', { recursive: true });
	const index = localIndex();
	const [command = 'status', ...rest] = process.argv.slice(2);
	if (command === 'sync') {
		const only = rest[0] && !/^\d+$/.test(rest[0]) ? rest[0] : undefined;
		const rounds = Number(rest.find((value) => /^\d+$/.test(value)) ?? 1);
		const context = { env: process.env as Record<string, unknown>, fetcher: fetch, now: () => new Date(), markdown: readableMarkdown };
		const raw = { put: async (key: string, value: string) => { const file = `.sources/raw/${key}`; await mkdir(dirname(file), { recursive: true }); await writeFile(file, value); } };
		for (let round = 0; round < rounds; round++) {
			let open = false;
			for (const plugin of SOURCE_PLUGINS.filter((one) => !only || one.id === only)) {
				const started = Date.now();
				const report = await syncSource(plugin, { index, context, raw, everyMinutes: 0, maxSteps: 4, budgetMs: 60_000 });
				console.log(JSON.stringify({ ...report, ms: Date.now() - started }));
				if (report.busy) await new Promise((resolve) => setTimeout(resolve, Math.min(report.busy!, 65) * 1000));
				open ||= !report.done && !report.failed;
			}
			if (!open) break;
		}
	} else if (command === 'search') {
		const started = performance.now();
		const result = index.search({ owner: true, query: rest.join(' '), limit: 8 });
		console.log(`${result.total} (${result.matched}) in ${(performance.now() - started).toFixed(1)} ms`);
		for (const hit of result.hits) console.log(`- [${hit.source}/${hit.kind}] ${hit.title} (${hit.date}) ${hit.url}\n    ${hit.excerpt?.slice(0, 160)}`);
	} else if (command === 'get') {
		const document = index.get(rest[0], { owner: true, limit: 600 });
		console.log(document ? { ...document, text: document.text.slice(0, 600) } : 'Not here.');
	}
	console.table(syncStatus(index, SOURCE_PLUGINS, process.env as Record<string, unknown>).map(({ icon: _icon, name: _name, ...entry }) => entry));
}
