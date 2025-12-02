import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		chunkSizeWarningLimit: 1000 // Increase limit for Three.js (3D library visualization)
	}
});
