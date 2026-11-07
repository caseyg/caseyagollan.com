import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Canonical discovery; preview builds can override both endpoint values.
	define: { __MICROPUB_ENDPOINT__: JSON.stringify(process.env.PUBLIC_MICROPUB_ENDPOINT || 'https://caseyagollan.com/micropub'), __INDIEAUTH_ISSUER__: JSON.stringify(process.env.PUBLIC_INDIEAUTH_ISSUER || 'https://caseyagollan.com/') },
	build: {
		chunkSizeWarningLimit: 1000 // Increase limit for Three.js (3D library visualization)
	}
});
