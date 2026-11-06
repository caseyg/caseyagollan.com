import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess(), mdsvex({ extensions: ['.md'] })],

	kit: {
		adapter: adapter({ config: 'wrangler.sveltekit.jsonc', platformProxy: { configPath: 'wrangler.jsonc' } }),
		// The hook retains form-origin checks everywhere except the token-only Micropub API.
		csrf: { checkOrigin: false },
		prerender: {
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
