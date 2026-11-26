import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { wiki } from './utils/vite-wiki';

export default defineConfig({
	plugins: [wiki(), sveltekit()],
	// Canonical discovery; preview builds can override both endpoint values. The tldraw key for workers.dev
	// previews is a Workers Builds variable on Previews only; a build of main never carries it.
	define: { __TLDRAW_PREVIEW_LICENSE_KEY__: JSON.stringify(process.env.WORKERS_CI_BRANCH === 'main' ? '' : process.env.PUBLIC_TLDRAW_PREVIEW_LICENSE_KEY || ''), __MICROPUB_ENDPOINT__: JSON.stringify(process.env.PUBLIC_MICROPUB_ENDPOINT || 'https://caseyagollan.com/micropub'), __INDIEAUTH_ISSUER__: JSON.stringify(process.env.PUBLIC_INDIEAUTH_ISSUER || 'https://caseyagollan.com/') },
	// The tables canvas (tldraw) is written in React.
	esbuild: { jsx: 'automatic' },
	build: {
		chunkSizeWarningLimit: 1000, // Increase limit for Three.js (3D library visualization)
		// Skip gzipping every chunk just to print its size in the build log.
		reportCompressedSize: false
	}
});
