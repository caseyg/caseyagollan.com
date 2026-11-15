import type { StorybookConfig } from '@storybook/sveltekit';

// Stories use sample pages, so a build without network access needn't fetch cag.wiki.
process.env.WIKI_OPTIONAL ??= '1';

const config: StorybookConfig = {
	stories: ['../src/lib/components/**/*.stories.@(ts|svelte)'],
	addons: ['@storybook/addon-docs', '@storybook/addon-svelte-csf'],
	framework: '@storybook/sveltekit',
	// Serve the site's images and generated Pagefind index from their normal paths. The deployed
	// Storybook lives at /storybook/ on the site itself, where those root paths already resolve,
	// so the site build skips copying static/ (thousands of files) a second time.
	staticDirs: process.env.STORYBOOK_SITE_ASSETS === 'external' ? [{ from: './public', to: '/' }] : ['../static', { from: './public', to: '/' }],
	core: { disableTelemetry: true },
	async viteFinal(config) {
		// Relative asset URLs work both at localhost:6006 and /storybook/ in production.
		return { ...config, base: './' };
	}
};
export default config;
