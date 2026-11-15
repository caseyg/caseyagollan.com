<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MasonryGrid from './MasonryGrid.svelte';

	const { Story } = defineMeta({ title: 'Primitives/MasonryGrid', component: MasonryGrid, parameters: { layout: 'padded' }, tags: ['!autodocs'] });

	// Blocks of varied heights show the columns packing; order reads left to right.
	const heights = [180, 260, 120, 320, 200, 140, 280, 220, 160, 300, 240, 130, 210, 190, 270, 150];
	const blocks = heights.map((height, index) => ({ id: `block-${index + 1}`, height }));
</script>

<Story asChild name="VariedHeights">
	<MasonryGrid items={blocks} key={(block) => block.id} label="Blocks">
		{#snippet item(block, index)}
			<div style="height: {block.height}px; background: var(--surface-2); border-radius: var(--radius-sm); padding: var(--space-2); font-size: var(--fs-sm);">{index + 1}</div>
		{/snippet}
	</MasonryGrid>
</Story>

<!-- Wider columns: fewer of them in the same width. -->
<Story asChild name="WideColumns">
	<MasonryGrid items={blocks.slice(0, 8)} key={(block) => block.id} minColumnWidth="22rem">
		{#snippet item(block, index)}
			<div style="height: {block.height}px; background: var(--surface-2); border-radius: var(--radius-sm); padding: var(--space-2); font-size: var(--fs-sm);">{index + 1}</div>
		{/snippet}
	</MasonryGrid>
</Story>

<Story asChild name="Phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	<MasonryGrid items={blocks} key={(block) => block.id}>
		{#snippet item(block, index)}
			<div style="height: {block.height / 2}px; background: var(--surface-2); border-radius: var(--radius-sm); padding: var(--space-2); font-size: var(--fs-sm);">{index + 1}</div>
		{/snippet}
	</MasonryGrid>
</Story>
