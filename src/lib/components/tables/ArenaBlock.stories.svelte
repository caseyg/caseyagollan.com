<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import ArenaBlock from './ArenaBlock.svelte';

	const { Story } = defineMeta({ title: 'Tables/ArenaBlock', component: ArenaBlock, tags: ['!autodocs'] });
</script>

<!-- Casey's Are.na on a table, as Are.na draws it. BlockCard uses this for every Are.na tile. -->
<Story asChild name="Kinds">
	<div class="tiles">
		{#each [blocks.arenaChannel, blocks.arenaPrivateChannel, blocks.arenaImage, blocks.arenaLink, blocks.arenaText] as block (block.url)}
			<div class="tile"><ArenaBlock {block} /></div>
		{/each}
	</div>
</Story>

<!-- Without details the title underneath goes, as the owner can choose per block. -->
<Story asChild name="Details hidden">
	<div class="tiles">
		<div class="tile"><ArenaBlock block={blocks.arenaImage} details={false} /></div>
		<div class="tile"><ArenaBlock block={blocks.arenaChannel} details={false} /></div>
	</div>
</Story>

<style>
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.tile {
		width: 240px;
		height: 280px;
	}
</style>
