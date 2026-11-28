/**
 * The Worker's side of naming untitled tables (`src/lib/table-names.ts` has the rules).
 *
 * When: a table is named once it is left, not while it is being made. The browser says so when
 * Casey leaves a table's page, which names it within a second; but a closed tab, a lost
 * connection or a table made from the chat never says anything, so every few minutes the Worker
 * also looks for untitled tables that were changed lately and have since sat still, and names
 * those. Older untitled tables are left alone until Casey asks for them (`nameUntitled`).
 */
import { isUntitled, nameLines, namePrompt, parseName } from '../table-names';
import type { TableSummary } from '../tables';
import { fastTextModel } from './voice';
import type { ChatModelEnv } from './chat/provider';
import { listTables, readTable, renameUntitled } from './tables';

export interface TableNamesEnv extends ChatModelEnv {
	PUBLISHING_STATE?: R2Bucket;
}

/** A model's name for these lines; null when its answer isn't a name. Throws when no model answers. */
export type AskName = (lines: string[], signal?: AbortSignal) => Promise<string | null>;

/** The chat's fast model as a namer, or undefined where no model can answer. */
export function namer(env: ChatModelEnv): AskName | undefined {
	const found = fastTextModel(env);
	if (!found) return undefined;
	return async (lines, signal) => {
		const { system, user } = namePrompt(lines);
		const began = Date.now();
		const reply = await found.models.completeSimple(
			found.model,
			{ systemPrompt: system, messages: [{ role: 'user', content: user, timestamp: Date.now() }] },
			// The answer is a few words; the room is for a thinking model's thoughts, which `low` keeps short.
			{ maxTokens: 600, reasoning: 'low', signal: signal ?? AbortSignal.timeout(15_000) }
		);
		if (reply.stopReason === 'error' || reply.stopReason === 'aborted') throw new Error(reply.errorMessage || 'The model stopped with an error');
		const name = parseName(reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(''));
		console.log(JSON.stringify({ event: 'table_name', model: `${found.model.provider}:${found.model.id}`, ms: Date.now() - began, lines: lines.length, named: !!name }));
		return name;
	};
}

export type Named = { id: string; name: string };
/** `named`: it has a name now. `kept`: it already had one. `empty`: nothing on it to name it by. `unsure`: the model's answer wasn't a name. */
export type NameOutcome = { state: 'named'; name: string } | { state: 'kept'; name: string } | { state: 'empty' | 'unsure' | 'missing' };

/** Names one table if it is still untitled and has words on it. */
export async function nameTable(bucket: R2Bucket, ask: AskName, id: string, signal?: AbortSignal): Promise<NameOutcome> {
	const table = await readTable(bucket, id);
	if (!table) return { state: 'missing' };
	if (!isUntitled(table)) return { state: 'kept', name: table.name };
	const lines = nameLines(table.document);
	if (!lines.length) return { state: 'empty' };
	const name = await ask(lines, signal);
	if (!name) return { state: 'unsure' };
	// The table is read again as it is saved, so a name or a canvas saved while the model thought is kept.
	const saved = await renameUntitled(bucket, id, name);
	return saved ? (saved.name === name ? { state: 'named', name } : { state: 'kept', name: saved.name }) : { state: 'missing' };
}

/* Which untitled tables were looked at and couldn't be named, so they aren't read again until they change. */
const TRIED = 'tables/names-tried.json';
type Tried = Record<string, string>;

async function readTried(bucket: R2Bucket): Promise<Tried> {
	try {
		const value = (await (await bucket.get(TRIED))?.json()) as unknown;
		return value && typeof value === 'object' && !Array.isArray(value) ? (value as Tried) : {};
	} catch {
		return {};
	}
}

/** Names these tables one after another, remembering the ones that can't be named as they are. */
async function nameEach(bucket: R2Bucket, ask: AskName, tables: TableSummary[], all: TableSummary[]): Promise<{ named: Named[]; failed: number }> {
	const tried = await readTried(bucket);
	const named: Named[] = [];
	let failed = 0, changed = false;
	for (const table of tables) {
		try {
			const outcome = await nameTable(bucket, ask, table.id);
			if (outcome.state === 'named') named.push({ id: table.id, name: outcome.name });
			else if (outcome.state === 'empty' || outcome.state === 'unsure') {
				tried[table.id] = table.updated;
				changed = true;
			}
		} catch (error) {
			// A model that didn't answer is asked again next time.
			failed += 1;
			console.error(JSON.stringify({ event: 'table_name_failed', error: String((error as Error)?.message ?? error).slice(0, 200) }));
		}
	}
	for (const id of Object.keys(tried)) if (!all.some((table) => table.id === id && isUntitled(table))) { delete tried[id]; changed = true; }
	if (changed) await bucket.put(TRIED, JSON.stringify(tried), { httpMetadata: { contentType: 'application/json' } }).catch(() => undefined);
	return { named, failed };
}

/** The untitled tables worth another look: not the ones already found to have nothing to name them by. */
async function waiting(bucket: R2Bucket): Promise<{ all: TableSummary[]; untitled: TableSummary[] }> {
	const all = await listTables(bucket);
	const tried = await readTried(bucket);
	return { all, untitled: all.filter((table) => isUntitled(table) && tried[table.id] !== table.updated) };
}

/** A table is left once nothing has changed on it for this long. */
export const IDLE_MS = 5 * 60_000;
/** The pass only names tables changed this lately, so the old untitled ones wait to be asked for. */
export const RECENT_MS = 3 * 60 * 60_000;
const PER_PASS = 5;

/** The pass the Worker makes every few minutes: untitled tables changed lately that have since sat still. */
export async function nameIdleTables(env: TableNamesEnv, now = Date.now(), ask = namer(env)): Promise<{ skipped?: true; named: number; failed: number }> {
	const bucket = env.PUBLISHING_STATE;
	if (!bucket || !ask) return { skipped: true, named: 0, failed: 0 };
	const { all, untitled } = await waiting(bucket);
	const due = untitled.filter((table) => { const age = now - Date.parse(table.updated); return age >= IDLE_MS && age <= RECENT_MS; }).slice(0, PER_PASS);
	if (!due.length) return { skipped: true, named: 0, failed: 0 };
	const { named, failed } = await nameEach(bucket, ask, due, all);
	return { named: named.length, failed };
}

const PER_ASK = 6;

/**
 * Every untitled table, however old, a few at a time: what Casey asks for to name the ones from
 * before tables named themselves. `left` is how many are still to look at; ask again until it is 0.
 */
export async function nameUntitled(bucket: R2Bucket, ask: AskName): Promise<{ named: Named[]; left: number }> {
	const { all, untitled } = await waiting(bucket);
	const { named, failed } = await nameEach(bucket, ask, untitled.slice(0, PER_ASK), all);
	// When the model answered for none of them, stop instead of asking for the same ones forever.
	const stuck = failed > 0 && failed === Math.min(untitled.length, PER_ASK);
	return { named, left: stuck ? 0 : Math.max(0, untitled.length - PER_ASK) + failed };
}
