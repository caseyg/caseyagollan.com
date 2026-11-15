import { escapeSearchHtml } from './search-document';
import { buildWiki } from '../src/lib/wiki/build';
import { fetchWikiVault, wikiPages } from './wiki-vault';
import type { WikiVault } from '../src/lib/wiki/types';

export { wikiPages };

/** Search text for a page: its rendered body, then its aliases so they find it too. */
export function wikiSearchContent(html: string, aliases: string[] = []): string {
	return `${html}${aliases.length ? `<p>${aliases.map(escapeSearchHtml).join(' · ')}</p>` : ''}`;
}

/** Wiki pages as the search index files them: at their address in the wiki browser. */
export function wikiDocuments(vault: WikiVault) {
	return buildWiki(vault).pages.map((page) => ({
		url: `/wiki/${page.slug}`,
		source: page.url,
		title: page.title,
		tags: page.tags,
		year: page.year ? [page.year] : [],
		html: wikiSearchContent(page.html, page.aliases)
	}));
}

export async function loadWikiDocuments(...args: Parameters<typeof fetchWikiVault>) {
	return wikiDocuments(await fetchWikiVault(...args));
}
