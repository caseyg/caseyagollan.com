import manifest from 'virtual:wiki-manifest';
import { localWikiHref, localizeWikiLinks } from './resolve';

/** Where a cag.wiki address opens on this site, or null when the page isn't published there. */
export const wikiHref = (href: string) => localWikiHref(href, manifest);

/** Rendered HTML with its cag.wiki links pointed at the wiki browser. */
export const localizeLinks = (html: string) => localizeWikiLinks(html, manifest);
