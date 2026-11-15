<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Popover from './Popover.svelte';
	import Icon from './Icon.svelte';

	const { Story } = defineMeta({ title: 'Primitives/Popover', component: Popover, parameters: { docs: { story: { height: '220px' } } } });
</script>

<!-- A panel beside its trigger, built on ui-sdk Popover: it opens in the top layer, closes on Escape, an outside press or a followed link, and returns focus to the trigger. For a list of pages, use SelectMenu. -->
<Story asChild name="Panel">
	<div class="row">
		<Popover label="Drafts (2)" align="start">
			{#snippet trigger()}<Icon name="drafts" size={18} /> 2{/snippet}
			<ul><li><a href="#one">Weeknotes</a></li><li><a href="#two">On composers</a></li></ul>
		</Popover>
		<Popover label="About this page" hideTitle={false} align="end">
			{#snippet trigger()}About{/snippet}
			<p>Aligned to the trigger’s end edge, with its title shown.</p>
		</Popover>
	</div>
</Story>

<style>
	.row { display: flex; justify-content: space-between; width: 24rem; }
	ul { margin: 0; padding: 0; list-style: none; }
	a { display: block; padding: var(--space-1) var(--space-2); color: inherit; }
	p { margin: var(--space-2); max-width: 14rem; }
</style>
