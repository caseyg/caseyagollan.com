/**
 * Pulls Casey's published Obsidian vault from cag.wiki for the build: the page list, the sitemap,
 * then every page's Markdown, many at a time. Both the wiki browser (through the Vite plugin) and
 * the search index use it; `utils/build.ts` fetches once and hands the result to both by file.
 */
import { readFile, rename, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { uniqueLabels, yearFilter } from './search-filters';
import type { WikiSourcePage, WikiVault } from '../src/lib/wiki/types';
import { WIKI_FILES } from '../src/lib/wiki/resolve';

const site = 'https://cag.wiki/';
const publish = 'https://publish-01.obsidian.md';
const vault = '8fa0f73a8388b8a25449a2b468e98cd2';
type WikiMetadata = { frontmatter?: Record<string, unknown> };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Obsidian Publish writes spaces in sitemap URLs as `+`, so compare decoded paths rather than encoded URLs. */
function pathKey(path: string) {
	return path.replace(/^\/+/, '').split('/').map((segment) => {
		try { return decodeURIComponent(segment.replace(/\+/g, ' ')); } catch { return segment; }
	}).join('/');
}

/** The published Markdown pages, as the sitemap lists them. Pages missing from the sitemap aren't public. */
export function wikiPages(cache: Record<string, WikiMetadata | null>, sitemap: string) {
	const urls = new Map([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1].replace(/&amp;/g, '&'))).filter((url) => url.origin === new URL(site).origin).map((url) => [pathKey(url.pathname), url.href]));
	return Object.entries(cache).flatMap(([path, entry]) => {
		if (!path.endsWith('.md') || entry?.frontmatter?.publish === false) return [];
		const metadata = entry?.frontmatter ?? {};
		const permalink = typeof metadata.permalink === 'string' ? metadata.permalink : path.replace(/\.md$/, '');
		const url = urls.get(pathKey(permalink));
		if (!url) return [];
		const title = typeof metadata.title === 'string' ? metadata.title : path.split('/').at(-1)!.replace(/\.md$/, '');
		const tags = uniqueLabels(Array.isArray(metadata.tags) ? metadata.tags : typeof metadata.tags === 'string' ? metadata.tags.split(/[,\s]+/) : []);
		const aliases = uniqueLabels(Array.isArray(metadata.aliases) ? metadata.aliases : [metadata.aliases]);
		return [{ path, url, title, tags, aliases, year: yearFilter(metadata.year) }];
	});
}

/** Fetch fresh published content, retrying transient failures; fail the build rather than ship a partial wiki. */
export async function fetchWikiVault(fetcher: Fetcher = fetch, { attempts = 3, retryDelayMs = 2_000, concurrency = 16 } = {}): Promise<WikiVault> {
	async function text(url: string) {
		for (let attempt = 1; ; attempt++) {
			let failure: Error;
			let response: Response | undefined;
			try {
				response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
				if (response.ok) return await response.text();
				failure = new Error(`Wiki: ${response.status} fetching ${url}`);
			} catch (error) {
				failure = new Error(`Wiki: ${error instanceof Error ? error.message : error} fetching ${url}`, { cause: error });
			}
			// Retry timeouts, network errors, rate limits, and server errors; a 404 or 403 will not fix itself.
			if (response && !response.ok && response.status < 500 && response.status !== 429) throw failure;
			if (attempt >= attempts) throw failure;
			console.warn(`${failure.message}; retrying (${attempt}/${attempts - 1})`);
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
		}
	}
	const [cacheText, sitemap, options] = await Promise.all([
		text(`${publish}/cache/${vault}`),
		text(`${site}sitemap.xml`),
		// Only names the home page, so the wiki still builds without it.
		text(`${publish}/options/${vault}`).catch(() => '{}')
	]);
	const cache = JSON.parse(cacheText) as Record<string, WikiMetadata | null>;
	const listed = wikiPages(cache, sitemap);
	if (!listed.length) throw new Error('Wiki: no published pages matched the sitemap');
	const pages: WikiSourcePage[] = [];
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(concurrency, listed.length) }, async () => {
		while (next < listed.length) {
			const page = listed[next++];
			const markdown = await text(`${WIKI_FILES}${page.path.split('/').map(encodeURIComponent).join('/')}`);
			pages.push({ ...page, markdown });
		}
	}));
	pages.sort((a, b) => a.path.localeCompare(b.path));
	const attachments = Object.keys(cache).filter((path) => !path.endsWith('.md')).sort();
	let indexFile: unknown;
	try {
		indexFile = (JSON.parse(options) as { indexFile?: unknown }).indexFile;
	} catch {
		// Without the site's options there's no home page; the index page still lists every page.
	}
	const home = typeof indexFile === 'string' ? pages.find((page) => page.path.replace(/\.md$/, '') === indexFile)?.path : undefined;
	return { fetchedAt: new Date().toISOString(), pages, attachments, home };
}

/** Write the vault for other build steps, all at once so a reader never sees half a file. */
export async function writeWikiVault(path: string, data: WikiVault) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(`${path}.tmp`, JSON.stringify(data));
	await rename(`${path}.tmp`, path);
}

/** Wait for another step to write the vault, failing when that step gives up. */
async function waitForVault(path: string, timeoutMs: number): Promise<WikiVault> {
	const failed = `${path}.failed`;
	const until = Date.now() + timeoutMs;
	for (;;) {
		try {
			return JSON.parse(await readFile(path, 'utf8')) as WikiVault;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		if (await stat(failed).then(() => true, () => false)) throw new Error(`Wiki: ${await readFile(failed, 'utf8')}`);
		if (Date.now() > until) throw new Error(`Wiki: timed out waiting for ${path}`);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/**
 * The vault for this build. Under `utils/build.ts`, `WIKI_VAULT` names the file it is fetching
 * into, so every step shares one fetch; run on its own, a step fetches for itself.
 */
export function loadWikiVault(): Promise<WikiVault> {
	const path = process.env.WIKI_VAULT;
	return path ? waitForVault(path, 120_000) : fetchWikiVault();
}
