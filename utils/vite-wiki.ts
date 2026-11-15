import type { Plugin } from 'vite';
import { loadWikiVault } from './wiki-vault';
import { wikiManifest } from '../src/lib/wiki/resolve';
import type { WikiVault } from '../src/lib/wiki/types';

const VAULT = 'virtual:wiki-vault';
const MANIFEST = 'virtual:wiki-manifest';

/**
 * Serves cag.wiki to the app as two modules: `virtual:wiki-vault`, every page's Markdown, for the
 * prerendered wiki routes; and `virtual:wiki-manifest`, the small name-to-address table the browser
 * uses to keep cag.wiki links on this site. A site build fails without the wiki; the dev server and
 * Storybook carry on with an empty one.
 */
export function wiki(): Plugin {
	let vault: Promise<WikiVault> | undefined;
	let required = false;
	const load = () =>
		(vault ??= loadWikiVault().catch((error: unknown) => {
			if (required) throw error;
			console.warn(`${error instanceof Error ? error.message : error}; continuing with an empty wiki`);
			return { fetchedAt: new Date().toISOString(), pages: [], attachments: [] };
		}));
	return {
		name: 'cag-wiki',
		configResolved(config) {
			required = config.command === 'build' && !process.env.WIKI_OPTIONAL;
		},
		resolveId(id) {
			if (id === VAULT || id === MANIFEST) return `\0${id}`;
		},
		async load(id) {
			if (id === `\0${VAULT}`) return `export default ${JSON.stringify(await load())};`;
			if (id === `\0${MANIFEST}`) return `export default ${JSON.stringify(wikiManifest((await load()).pages))};`;
		}
	};
}
