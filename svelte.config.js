import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { execSync } from 'node:child_process';

/**
 * Name the build after the code, not the clock. SvelteKit's default is a timestamp, which renames
 * every JS chunk (and so rewrites every page) on each build. Hashing the repository tree minus the
 * `content` submodule keeps a content-only publish from changing any JS. Falls back to the default.
 */
function codeVersion() {
	try {
		const tree = execSync('git ls-tree HEAD', { encoding: 'utf8' })
			.split('\n')
			.filter((line) => line && !line.endsWith('\tcontent'))
			.join('\n');
		return execSync('git hash-object --stdin', { input: tree, encoding: 'utf8' }).trim().slice(0, 12);
	} catch {
		return undefined;
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess(), mdsvex({ extensions: ['.md'] })],

	kit: {
		version: { name: codeVersion() },
		// The adapter proxy cannot run our custom Worker or its Durable Object class.
		// Use `bun run preview` for the full Worker with local bindings.
		adapter: adapter({ config: 'wrangler.sveltekit.jsonc', platformProxy: { configPath: 'wrangler.sveltekit.jsonc' } }),
		// The hook retains form-origin checks everywhere except the token-only Micropub API.
		csrf: { trustedOrigins: ['*'] },
		prerender: {
			// Standard.site <link> tags name AT Protocol records (at://did:plc:…), which aren't pages to crawl.
			handleInvalidUrl: ({ href, message }) => {
				if (href.startsWith('at://')) return;
				throw new Error(message);
			},
			handleHttpError: ({ path, referrer, message }) => {
				// Ignore 404s for pages we haven't migrated yet
				if (path.startsWith('/posts') || path === '/feed.xml' || path === '/index-accessible.html') {
					return;
				}
				// Ignore trailing slash mismatches for date-based permalinks
				if (referrer && path === referrer.replace(/\/$/, '')) {
					return;
				}
				throw new Error(message);
			}
		}
	}
};

export default config;
