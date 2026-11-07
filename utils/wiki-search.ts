import { renderContentSync } from '../src/lib/utils/renderContent';
import { escapeSearchHtml } from './search-document';
import { uniqueLabels, yearFilter } from './search-filters';

const site = 'https://cag.wiki/';
const publish = 'https://publish-01.obsidian.md';
const vault = '8fa0f73a8388b8a25449a2b468e98cd2';
type WikiMetadata = { frontmatter?: Record<string, unknown> };

export function wikiPages(cache: Record<string, WikiMetadata | null>, sitemap: string) {
 const urls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1].replace(/&amp;/g, '&')).href));
 return Object.entries(cache).flatMap(([path, entry]) => {
  if (!path.endsWith('.md') || entry?.frontmatter?.publish === false) return [];
  const metadata = entry?.frontmatter ?? {};
  const permalink = typeof metadata.permalink === 'string' ? metadata.permalink : path.replace(/\.md$/, '');
  const url = new URL(permalink.split('/').map(encodeURIComponent).join('/'), site).href;
  if (!urls.has(url)) return [];
  const title = typeof metadata.title === 'string' ? metadata.title : path.split('/').at(-1)!.replace(/\.md$/, '');
  const tags = uniqueLabels(Array.isArray(metadata.tags) ? metadata.tags : typeof metadata.tags === 'string' ? metadata.tags.split(/[,\s]+/) : []);
  const aliases = uniqueLabels(Array.isArray(metadata.aliases) ? metadata.aliases : [metadata.aliases]);
  return [{ path, url, title, tags, aliases, year: yearFilter(metadata.year) }];
 });
}

export function wikiSearchContent(markdown: string, aliases: string[] = []): string {
 const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  .replace(/%%[\s\S]*?%%/g, '')
  .replace(/(!?)\[\[([^\]]+)\]\]/g, (_match, embed: string, target: string) => {
   const [path, label] = target.split('|');
   if (embed && /\.(png|jpe?g|gif|webp|svg|pdf|mp[34]|wav)(?:#.*)?$/i.test(path)) return '';
   return label?.trim() || path.split('#')[0].split('/').at(-1) || '';
  });
 return `${renderContentSync(body)}${aliases.length ? `<p>${aliases.map(escapeSearchHtml).join(' · ')}</p>` : ''}`;
}

/** Fetch fresh published content; fail the build rather than silently ship a partial index. */
export async function loadWikiDocuments(fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch) {
 async function text(url: string) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Wiki indexing: ${response.status} fetching ${url}`);
  return response.text();
 }
 const [cache, sitemap] = await Promise.all([text(`${publish}/cache/${vault}`), text(`${site}sitemap.xml`)]);
 const pages = wikiPages(JSON.parse(cache), sitemap);
 if (!pages.length) throw new Error('Wiki indexing: no published pages matched the sitemap');
 const documents: (typeof pages[number] & { html: string })[] = [];
 let next = 0;
 await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < pages.length) {
   const page = pages[next++];
   const markdown = await text(`${publish}/access/${vault}/${page.path.split('/').map(encodeURIComponent).join('/')}`);
   documents.push({ ...page, html: wikiSearchContent(markdown, page.aliases) });
  }
 }));
 return documents.sort((a, b) => a.path.localeCompare(b.path));
}
