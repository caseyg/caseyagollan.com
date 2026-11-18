<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FeedMenu from './FeedMenu.svelte';

	const { Story } = defineMeta({
		title: 'Posts/FeedMenu',
		component: FeedMenu,
		parameters: { docs: { story: { height: '240px' } } }
	});
</script>

<!-- The site's RSS, Atom and JSON feeds, offered from the posts page. -->
<Story name="Default" />

<!-- Each feed's drawn icon and address, from `MenuOption.iconName` and `detail`. -->
<Story name="Open" play={async ({ canvasElement }) => canvasElement.querySelector<HTMLElement>('.select-menu-trigger')?.click()} />

<Story name="One feed" args={{ feeds: [{ path: '/feed.xml', label: 'RSS', mime: 'application/rss+xml', icon: 'rss' }], label: 'Follow' }} />
