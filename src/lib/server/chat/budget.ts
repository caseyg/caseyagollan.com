/**
 * What each person's chat costs, by calendar month (UTC), and the cap on it.
 *
 * Every answer's model usage is priced (the registry in `chat-models.ts`, each provider's own rates) and
 * charged to the people whose messages it answered, split evenly. Spend is kept per person
 * per month in `PUBLISHING_STATE` at `chat/spend/<YYYY-MM>/<hashed person id>.json`, so it
 * counts across every thread. Casey's own messages are not capped.
 */
import { modelPrice } from '../../chat-models';

export const DEFAULT_MONTHLY_BUDGET = 3;

/** US dollars per million tokens, from the model registry. Unknown models use the dearest. */
export const priceOf = (model: string) => modelPrice(model);

export const monthOf = (at: number) => new Date(at).toISOString().slice(0, 7);

/** The first moment of next month, for “resets on …”. */
export function resetsOn(at: number): string {
	const date = new Date(at);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

async function key(personId: string, at: number): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(personId)));
	const hash = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `chat/spend/${monthOf(at)}/${hash}.json`;
}

export async function spent(bucket: R2Bucket | undefined, personId: string, at = Date.now()): Promise<number> {
	if (!bucket) return 0;
	const object = await bucket.get(await key(personId, at));
	if (!object) return 0;
	return Number((await object.json<{ usd?: number }>().catch(() => ({ usd: 0 }))).usd) || 0;
}

/** Adds to a person's month. A read then a write: two answers finishing at once may undercount by one. */
export async function charge(bucket: R2Bucket | undefined, personId: string, usd: number, at = Date.now()): Promise<number> {
	if (!bucket || !(usd > 0)) return 0;
	const total = (await spent(bucket, personId, at)) + usd;
	await bucket.put(await key(personId, at), JSON.stringify({ usd: total, updatedAt: at }), { httpMetadata: { contentType: 'application/json' } });
	return total;
}

/** The cost of entries' model responses: pi-ai's own figure when it has one, otherwise priced from the tokens. */
export function costOf(entries: readonly { model?: readonly unknown[] }[]): number {
	let usd = 0;
	for (const entry of entries) {
		const message = entry.model?.[0] as { role?: string; model?: string; usage?: { input?: number; output?: number; cacheRead?: number; cost?: { total?: number } } } | undefined;
		if (message?.role !== 'assistant' || !message.usage) continue;
		const total = message.usage.cost?.total;
		if (typeof total === 'number' && total > 0) { usd += total; continue; }
		const price = priceOf(message.model ?? '');
		usd += (((message.usage.input ?? 0) + (message.usage.cacheRead ?? 0)) * price.input + (message.usage.output ?? 0) * price.output) / 1_000_000;
	}
	return usd;
}
