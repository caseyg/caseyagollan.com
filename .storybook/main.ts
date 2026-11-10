import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	stories: ['../src/lib/components/**/*.stories.@(ts|svelte)'],
	addons: ['@storybook/addon-docs', '@storybook/addon-svelte-csf'],
	framework: '@storybook/sveltekit',
	// Serve the site's images and generated Pagefind index from their normal paths.
	staticDirs: ['../static', { from: './public', to: '/' }],
	core: { disableTelemetry: true },
	async viteFinal(config) {
		// Relative asset URLs work both at localhost:6006 and /storybook/ in production.
		return { ...config, base: './' };
	}
};
export default config;
