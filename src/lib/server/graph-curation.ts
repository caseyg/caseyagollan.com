import { emptyCuration, parseCuration, pageSummary, domainOf, type GraphCuration } from '../graph-curation';
import type { InsightSource } from '../insight-types';
import { safePublicFetch } from './publishing/public-fetch';

/*
 * Kept in the publishing-state bucket rather than INSIGHT_CACHE: that KV namespace is writable
 * through /api/kv, and previews read production KV but get their own state bucket.
 */
const KEY = 'graph/curation.json';

export async function readCuration(bucket: R2Bucket | undefined): Promise<GraphCuration> {
	if (!bucket) return emptyCuration();
	try {
		const object = await bucket.get(KEY);
		return object ? parseCuration(await object.json()) : emptyCuration();
	} catch (e) {
		console.error('Graph curation read error:', e);
		return emptyCuration();
	}
}

export async function writeCuration(bucket: R2Bucket, curation: GraphCuration): Promise<void> {
	await bucket.put(KEY, JSON.stringify(curation), { httpMetadata: { contentType: 'application/json' } });
}

/** Fetches a page once to name it; a page that can't be read is still kept, named by its host. */
export async function summarizePage(url: string, fetcher: typeof fetch = fetch): Promise<{ source: InsightSource; fetched: boolean }> {
	const fallback: InsightSource = { url, title: domainOf(url) ?? url, page_age: null, cited_text: null };
	try {
		const response = await safePublicFetch(url, { headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'caseyagollan.com link preview' } }, fetcher);
		if (!response.ok || !/html/i.test(response.headers.get('content-type') ?? '')) return { source: fallback, fetched: false };
		return { source: pageSummary(await response.text(), url), fetched: true };
	} catch {
		return { source: fallback, fetched: false };
	}
}
