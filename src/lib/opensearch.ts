import { SITE_URL } from './feeds';
import { SITE_IDENTITY } from './identity';

/** The query string that opens site search with a query already typed, on any page with the nav. */
export const SEARCH_QUERY_PARAM = 'q';
export const OPENSEARCH_PATH = '/opensearch.xml';
export const OPENSEARCH_TITLE = SITE_IDENTITY.name;

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * An OpenSearch description, so a browser can add the site as a search engine. Its search URL is
 * the homepage with `?q=`, which opens the Pagefind search modal on that query.
 */
export function openSearchDescription(siteUrl = SITE_URL): string {
	const template = `${siteUrl}/?${SEARCH_QUERY_PARAM}={searchTerms}`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
	<ShortName>${escape(OPENSEARCH_TITLE)}</ShortName>
	<Description>${escape(`Search posts, books, wiki and Are.na on ${new URL(siteUrl).hostname}`)}</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Image width="128" height="128" type="image/webp">${escape(SITE_IDENTITY.photo)}</Image>
	<Url type="text/html" method="get" template="${escape(template)}" />
	<Url type="application/opensearchdescription+xml" rel="self" template="${escape(siteUrl + OPENSEARCH_PATH)}" />
	<moz:SearchForm>${escape(siteUrl + '/')}</moz:SearchForm>
</OpenSearchDescription>
`;
}
