<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Corner, SegmentedPill } from '.';
	import Nav from '../Nav.svelte';

	const { Story } = defineMeta({ title: 'Primitives/Corner', component: Corner, parameters: { layout: 'fullscreen' } });
</script>

<!-- Top-left says where you are, top-right where you can go. Both stay put while the page scrolls. -->
<Story asChild name="BothCorners">
	<Corner side="start">
		<SegmentedPill size="md" tone="quiet" compact segments={[{ label: 'Posts', href: '/posts/', icon: '📡' }, { label: '2026', href: '/2026/', current: true, count: 42 }]} />
	</Corner>
	<Nav currentPage="posts" />
</Story>

<!-- A corner can hold more than one group, as the library does with its view switch and sort control. -->
<Story asChild name="TwoGroups">
	<Corner side="start">
		<SegmentedPill
			size="md"
			compact
			label="Library view"
			value="shelves"
			segments={[
				{ label: 'Graph', icon: '🕸️', value: 'graph' },
				{ label: 'Shelves', icon: '📚', value: 'shelves' }
			]}
		/>
		<SegmentedPill size="md" compact segments={[{ label: 'Recently acquired', icon: '📅', onclick: () => {} }]} />
	</Corner>
	<Nav currentPage="library" />
</Story>
