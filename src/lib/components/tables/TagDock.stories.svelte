<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { seedTags } from '$lib/tag-edits.svelte';
	import TableBlock from './TableBlock.svelte';
	import TagDock from './TagDock.svelte';
	import type { TaggableBlock } from './canvas/TableEditor';

	const { Story } = defineMeta({ title: 'Tables/TagDock', component: TagDock, tags: ['!autodocs'] });

	const post = 'post:/2026/11/13/against-disliteracy/';
	const taggable: TaggableBlock[] = [
		{ id: 'a', ref: post, title: 'Against disliteracy', selected: true, details: true },
		{ id: 'b', ref: 'raindrop:101', title: 'Calm technology', selected: true, details: true },
		{ id: 'c', ref: 'post:/2026/11/06/changelog/', title: '2026-11-06 Changelog', selected: false, details: true }
	];
	// The dock and the cards read one store, as on a table page.
	seedTags(
		{ [post]: ['reading'], 'raindrop:101': ['research', 'indieweb'], 'post:/2026/11/06/changelog/': ['changelog'] },
		{ [post]: { add: ['tables'], remove: [] }, 'raindrop:101': { add: ['tables'], remove: ['research'] } },
		{ [post]: 'Against disliteracy', 'raindrop:101': 'Calm technology' }
	);
	const frame = 'width: 22rem; height: 32rem; padding: var(--space-4); border: 1px solid var(--border); display: flex;';
</script>

<!-- Tags of the two selected blocks, with a change staged for both. -->
<Story asChild name="Editing a selection">
	<div style={frame}><TagDock {taggable} /></div>
</Story>

<Story asChild name="Reviewing">
	<div style={frame}><TagDock {taggable} mode="review" /></div>
</Story>

<!-- A block on the table with its tags along the bottom, staged changes marked. -->
<Story asChild name="A card with its tags">
	<div style="width: 15rem; height: 15rem; position: relative;">
		<TableBlock block={{ kind: 'post', url: '/2026/11/13/against-disliteracy/', title: 'Against disliteracy', excerpt: 'Reading is a practice, not a product.' }} details />
	</div>
</Story>
