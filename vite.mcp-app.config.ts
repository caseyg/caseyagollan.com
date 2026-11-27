/**
 * Builds the table view Claude shows (`src/mcp-app/`, an MCP App) as one script and one stylesheet
 * under `/mcp-app/`. It is its own build because the view isn't a page of the site: its host loads
 * it into a sandboxed frame, so it can't use SvelteKit's router or start-up code.
 */
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import site from './vite.config';
import { wiki } from './utils/vite-wiki';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	plugins: [wiki(), svelte({ configFile: false, preprocess: vitePreprocess() })],
	resolve: {
		alias: {
			$lib: at('./src/lib'),
			// The site's components reach for SvelteKit's router here and there; the view has none.
			'$app/navigation': at('./src/mcp-app/stubs/navigation.ts'),
			'$app/state': at('./src/mcp-app/stubs/state.ts'),
			'$app/environment': at('./src/mcp-app/stubs/environment.ts'),
			'$app/paths': at('./src/mcp-app/stubs/paths.ts')
		}
	},
	define: site.define,
	esbuild: { jsx: 'automatic' },
	// Chunks and pictures load from beside the script, wherever the site is served from.
	base: './',
	publicDir: false,
	build: {
		outDir: process.env.MCP_APP_OUTPUT || '.svelte-kit/build-mcp-app',
		emptyOutDir: true,
		manifest: true,
		chunkSizeWarningLimit: 3000,
		reportCompressedSize: false,
		rollupOptions: { input: at('./src/mcp-app/table-view.svelte.ts') }
	}
});
