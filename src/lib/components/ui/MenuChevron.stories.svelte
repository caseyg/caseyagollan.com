<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FeedMenu from '../posts/FeedMenu.svelte';
	import SegmentedPill from './SegmentedPill.svelte';
	import SelectMenu from './SelectMenu.svelte';

	const sections = [
		{ value: 'top', label: 'Casey Gollan', href: '#top', icon: '👋' },
		{ value: 'currently', label: 'Currently', href: '#currently', icon: '📍' },
		{ value: 'exploring', label: 'Exploring', href: '#exploring', icon: '🧭' }
	];

	const { Story } = defineMeta({ title: 'Primitives/MenuChevron', parameters: { docs: { story: { height: '240px' } } } });
</script>

<!--
	Every button that opens a menu ends in the same chevron. It sits in a segment of its own, a
	divider between it and the label, so the button reads as a split button, and it turns over
	while the menu is open.
-->
<Story name="Split buttons">
	<div class="row">
		<SegmentedPill size="md" tone="quiet" segments={[{ label: 'Exploring', icon: '🧭', current: true, menu: sections, menuActive: 'exploring' }]} />
		<SegmentedPill size="md" segments={[{ label: 'Posts', href: '/posts/', icon: '📝' }, { label: 'Notes', icon: '💬', count: 42, menu: sections }]} />
		<FeedMenu />
		<SelectMenu current="Exploring" currentIcon="🧭" options={sections} />
	</div>
</Story>

<!-- A quiet trigger has no outline to divide, so its chevron follows the label with no divider. -->
<Story name="Quiet">
	<SelectMenu variant="quiet" current="Exploring" options={sections} />
</Story>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}
</style>
