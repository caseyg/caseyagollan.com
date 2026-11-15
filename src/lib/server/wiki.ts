import vault from 'virtual:wiki-vault';
import { buildWiki, type Wiki } from '$lib/wiki/build';

let wiki: Wiki | undefined;

/** cag.wiki as fetched for this build, rendered once and shared by every wiki page it prerenders. */
export function getWiki(): Wiki {
	return (wiki ??= buildWiki(vault));
}
