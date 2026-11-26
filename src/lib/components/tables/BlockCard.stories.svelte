<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, blueskyRepost, mastodonLike, note, reply } from '$lib/storybook/fixtures';
	import { sourceView } from '$lib/table-post-source';
	import BlockCard from './BlockCard.svelte';

	const { Story } = defineMeta({ title: 'Tables/BlockCard', component: BlockCard, tags: ['!autodocs'] });
</script>

<!-- Tiles as they sit on a table: pictures lead where there is one; text blocks are outlined in blue. -->
<Story asChild name="Tiles">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.article} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.book} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.bookNoCover} /></div>
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.wiki} /></div>
		<div class="tile" style="width: 280px; height: 240px"><BlockCard block={blocks.link} /></div>
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.note} source={null} /></div>
	</div>
</Story>

<!-- Posts as they read where they came from: a repost of a Bluesky post, a like of a Mastodon one, a note, a reply
     under the post it answers. On a table each fetches its post (`source.json`); here it is passed in. -->
<Story asChild name="Like their source">
	<div class="tiles">
		<div class="tile" style="width: 360px; height: 520px"><BlockCard block={blocks.repost} source={sourceView(blueskyRepost)} /></div>
		<div class="tile" style="width: 360px; height: 200px"><BlockCard block={blocks.like} source={sourceView(mastodonLike)} /></div>
		<div class="tile" style="width: 360px; height: 180px"><BlockCard block={blocks.note} source={sourceView(note)} /></div>
		<div class="tile" style="width: 360px; height: 300px"><BlockCard block={blocks.note} source={sourceView(reply)} /></div>
		<div class="tile" style="width: 360px; height: 200px"><BlockCard block={blocks.socialPost} /></div>
		<div class="tile" style="width: 360px; height: 200px"><BlockCard block={blocks.socialPost} details={false} /></div>
	</div>
</Story>


<!-- An older table's plain link to one of the site's posts draws as that post, and upgrades to it when Casey opens the table. -->
<Story asChild name="Link to a site post">
	<div class="tiles">
		<div class="tile" style="height: 240px"><BlockCard block={{ kind: 'link', url: '/2026/11/21/3n2tm63slgc2o', title: '/2026/11/21/3n2tm63slgc2o', meta: 'caseyagollan.com', icon: '🏠' }} source={sourceView(mastodonLike)} /></div>
		<div class="tile" style="height: 240px"><BlockCard block={{ kind: 'link', url: '/2026/11/21/3n2tm63slgc2o', title: '/2026/11/21/3n2tm63slgc2o', meta: 'caseyagollan.com', icon: '🏠' }} source={null} /></div>
	</div>
</Story>
<!-- Pieces taken out of a page: a picture shown whole, a quote that leads with its words, a social post. -->
<Story asChild name="Pieces">
	<div class="tiles">
		<div class="tile" style="width: 280px; height: 240px"><BlockCard block={blocks.image} /></div>
		<div class="tile" style="width: 300px; height: 180px"><BlockCard block={blocks.quote} /></div>
		<div class="tile" style="width: 360px; height: 200px"><BlockCard block={blocks.socialPost} /></div>
	</div>
</Story>

<!-- With details hidden, as the owner can choose per block: no source line and no kind tile. -->
<Story asChild name="Details hidden">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.wiki} details={false} /></div>
		<div class="tile" style="width: 180px; height: 300px"><BlockCard block={blocks.book} details={false} /></div>
		<div class="tile" style="width: 280px; height: 240px"><BlockCard block={blocks.image} details={false} /></div>
		<div class="tile" style="width: 300px; height: 180px"><BlockCard block={blocks.quote} details={false} /></div>
		<div class="tile" style="width: 360px; height: 420px"><BlockCard block={blocks.repost} source={sourceView(blueskyRepost)} details={false} /></div>
		<div class="tile" style="width: 360px; height: 200px"><BlockCard block={blocks.note} source={sourceView(reply)} details={false} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaChannel} details={false} /></div>
	</div>
</Story>

<!-- Casey's Are.na as Are.na draws it: channels ruled in their colour, pictures whole, text in a white square, titles under. -->
<Story asChild name="Are.na">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaChannel} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaPrivateChannel} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaImage} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaLink} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaText} /></div>
		<div class="tile" style="width: 240px; height: 280px"><BlockCard block={blocks.arenaImage} details={false} /></div>
	</div>
</Story>

<!-- A Raindrop bookmark, which only the signed-in owner can add. -->
<Story asChild name="Raindrop">
	<div class="tiles">
		<div class="tile" style="width: 240px; height: 240px"><BlockCard block={blocks.raindrop} /></div>
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
