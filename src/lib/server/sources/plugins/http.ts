/** What every plugin's requests share: a timeout, a name for the site, and one way of saying "slow down". */
import { SourceBusy, type SyncContext } from '../types';

const USER_AGENT = 'caseyagollan.com/1.0 (+https://caseyagollan.com/)';

/** Reads JSON from a service. A 429 becomes `SourceBusy`, so the sync waits rather than fails. */
export async function getJson<T>(context: SyncContext, source: string, url: string, headers: Record<string, string> = {}): Promise<T> {
	// Workers refuse a stored `fetch` called as a method, so it is always called bare.
	const fetcher = context.fetcher;
	const response = await fetcher(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
	if (response.status === 429) throw new SourceBusy(source, Math.min(Math.max(Number(response.headers.get('retry-after')) || 60, 5), 600));
	// The status only: a service's error page may repeat the request, and nothing of a token belongs in a log.
	if (!response.ok) throw new Error(`${source}: ${response.status}`);
	return (await response.json()) as T;
}

export const iso = (value: unknown): string | undefined => {
	const time = typeof value === 'string' || typeof value === 'number' ? Date.parse(String(value)) : NaN;
	return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};
export const webUrl = (value: unknown): string | undefined => (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : undefined);
export const host = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const flat = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
export const secret = (env: Record<string, unknown>, name: string): string | undefined => (typeof env[name] === 'string' && env[name] ? (env[name] as string) : undefined);

/** Whether a pass should list everything: the first one, and one a week after, which is how removals are noticed. */
export function wantsFull(state: { since?: string; full?: string }, now: Date, days = 7): boolean {
	return !state.since || !state.full || now.getTime() - Date.parse(state.full) > days * 86_400_000;
}

/** Addresses a Markdown text links to, as written, without repeats. */
export function linksIn(markdown: string): string[] {
	return [...new Set([...markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]))].slice(0, 300);
}
