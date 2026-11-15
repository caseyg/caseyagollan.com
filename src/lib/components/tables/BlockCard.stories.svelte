<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import BlockCard from './BlockCard.svelte';

	const { Story } = defineMeta({ title: 'Tables/BlockCard', component: BlockCard, tags: ['!autodocs'] });
</script>

<!-- Tiles as they sit on a table: pictures lead where there is one; text blocks are the site's blue. -->
<Story asChild name="Tiles">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.article} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.book} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.bookNoCover} /></div>
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.wiki} /></div>
		<div class="tile" style="width: 280px; height: 240px"><BlockCard block={blocks.link} /></div>
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.note} /></div>
	</div>
</Story>

<!-- A picture that fails to load falls back to the text block. Long titles clamp. -->
<Story asChild name="Broken image and long title">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={{ ...blocks.link, image: '/missing.png' }} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.longTitle} /></div>
		<div class="tile" style="width: 120px; height: 120px"><BlockCard block={blocks.article} /></div>
	</div>
</Story>

<!-- Rows: the block picker's results. -->
<Story asChild name="Rows">
	<div class="rows">
		{#each Object.values(blocks) as block (block.url)}
			<BlockCard {block} layout="row" />
		{/each}
	</div>
</Story>

<!-- Bare tiles: pictures without text, for thumbnails. -->
<Story asChild name="Bare">
	<div class="tiles">
		<div class="tile" style="width: 120px; height: 90px"><BlockCard block={blocks.book} bare /></div>
		<div class="tile" style="width: 120px; height: 90px"><BlockCard block={blocks.link} bare /></div>
	</div>
</Story>

<style>
	.tiles { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-5); }
	.rows { display: flex; flex-direction: column; width: 22rem; }
</style>
