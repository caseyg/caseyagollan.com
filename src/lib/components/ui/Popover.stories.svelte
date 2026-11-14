<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Popover from './Popover.svelte';

	const { Story } = defineMeta({ title: 'Primitives/Popover', component: Popover, parameters: { docs: { story: { height: '220px' } } } });
</script>

<!-- The shared menu primitive: closes on an outside click, on Escape, and when a link inside is followed. SelectMenu and the composer's menus build on it. -->
<Story asChild name="Menu">
	<div class="row">
		<Popover triggerClass="demo-trigger" panelClass="demo-panel">
			{#snippet trigger(open)}Post type {open ? '▴' : '▾'}{/snippet}
			<ul><li><a href="#note">Note</a></li><li><a href="#article">Article</a></li><li><a href="#photo">Photo</a></li></ul>
		</Popover>
		<Popover align="end" label="Drafts" triggerClass="demo-trigger" panelClass="demo-panel">
			{#snippet trigger()}Drafts (2){/snippet}
			<p>Aligned to the trigger’s end edge.</p>
		</Popover>
	</div>
</Story>

<style>
	.row { display: flex; justify-content: space-between; width: 24rem; }
	:global(.demo-trigger) { padding: var(--space-1) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-full); background: transparent; color: var(--text-primary); }
	:global(.demo-panel) { min-width: 10rem; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-primary); box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3); }
	ul { margin: 0; padding: 0; list-style: none; }
	a { display: block; padding: var(--space-1) var(--space-2); color: inherit; }
</style>
