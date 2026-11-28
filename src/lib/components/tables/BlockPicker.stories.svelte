<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, feedItems } from '$lib/storybook/fixtures';
	import type { Block } from '$lib/tables';
	import type { SourceFilter } from '$lib/table-sources';
	import BlockPicker from './BlockPicker.svelte';

	const { Story } = defineMeta({ title: 'Tables/BlockPicker', component: BlockPicker, tags: ['!autodocs'] });

	const all: Block[] = Object.values(blocks);
	/** Stands in for site search: filters the fixtures by kind and title. */
	async function search(query: string, filter: SourceFilter): Promise<Block[]> {
		if (!query.trim() && filter === 'all') return [];
		return all.filter((block) => (filter === 'all' || block.kind === filter) && block.title.toLowerCase().includes(query.trim().toLowerCase()));
	}
	const unavailable = async () => null;
	/** Stands in for reading a page: a picture, a social post and paragraphs. */
	const pieces = async (): Promise<Block[]> => [blocks.image, blocks.socialPost, blocks.quote, { ...blocks.quote, url: '/wiki/aesthetic-crisis#:~:text=Second', excerpt: 'A second paragraph, long enough to be taken on its own and set out beside the first.' }];
	const add = (added: Block[]) => console.log('add', added);
	/** Stands in for the week's posts and saves. */
	const recent = async (since: Date) => feedItems().filter((item) => Date.parse(item.at) >= since.getTime());
	/** Stands in for likeness by the stored vectors. */
	const similar = async (): Promise<Block[]> => [blocks.arenaImage, blocks.arenaLink, blocks.raindrop, blocks.arenaText];
</script>

<Story asChild name="Results">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} query="a" /></div>
</Story>

<Story asChild name="Books, browsing">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} filter="book" /></div>
</Story>

<Story asChild name="Are.na, browsing">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} filter="arena" /></div>
</Story>

<!-- Signed in, the owner also gets Raindrop. -->
<Story asChild name="Owner, Raindrop">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} owner filter="raindrop" /></div>
</Story>

<Story asChild name="Empty query">
	<div class="dock"><BlockPicker {search} onadd={add} /></div>
</Story>

<!-- Opened with a block selected: its page's pieces come first, and the ones already on the table are left out. -->
<Story asChild name="Pieces of the selected page">
	<div class="dock"><BlockPicker {search} {pieces} source={blocks.wiki} placed={[blocks.quote.url]} onadd={add} onclose={() => {}} /></div>
</Story>

<!-- Blocks already on the table are left out of the results. -->
<Story asChild name="Leaves out placed blocks">
	<div class="dock"><BlockPicker {search} onadd={add} placed={[blocks.article.url]} query="a" /></div>
</Story>

<!-- Without a search index (such as `vite dev` before a search build), links still work. -->
<Story asChild name="No search index">
	<div class="dock"><BlockPicker search={unavailable} onadd={add} query="cage" /></div>
</Story>

<!-- With a feed, the menu has a Recent list, and a button that keeps the picker open as a sidebar. -->
<Story asChild name="Recent, in the menu">
	<div class="dock"><BlockPicker {search} {recent} onadd={add} onclose={() => {}} onpin={() => {}} tab="recent" /></div>
</Story>

<!-- Kept open down the right of the page for a roundup: it opens on the week, and what is on the table is gray. -->
<Story asChild name="Sidebar" parameters={{ layout: 'fullscreen' }}>
	<div class="page"><BlockPicker {search} {recent} pinned onadd={add} onclose={() => {}} onpin={() => {}} placed={[blocks.arenaImage.url + ' ' + blocks.arenaImage.image, blocks.repost.url]} /></div>
</Story>

<!-- Opened with a block selected, the owner gets its page's pieces and what is saved that is like it, beside the week and search. -->
<Story asChild name="A block selected, every list">
	<div class="dock"><BlockPicker {search} {pieces} {similar} {recent} source={blocks.wiki} onadd={add} onclose={() => {}} /></div>
</Story>

<!-- A picture finds what looks like it. It has no page to take pieces from, so the picker opens on Similar. -->
<Story asChild name="Similar to a picture">
	<div class="dock"><BlockPicker {search} pieces={async () => []} {similar} source={blocks.arenaImage} placed={[blocks.raindrop.url]} onadd={add} onclose={() => {}} /></div>
</Story>

<style>
	.page { min-height: 100vh; }
	.dock { width: 22rem; height: 36rem; }
</style>

<!-- A sticky or text box selected: what reads like its words. -->
<Story asChild name="Similar to a sticky">
	<div class="dock"><BlockPicker {search} {pieces} {similar} {recent} like={[{ words: 'Why do kettles whistle? Something about steam and a narrow gap.' }]} linkFrom={['sticky']} onaddlinked={add} onadd={add} onclose={() => {}} /></div>
</Story>

<!-- Several things selected, of any kind: what is like more of them comes first. -->
<Story asChild name="Similar to several things">
	<div class="dock"><BlockPicker {search} {pieces} {similar} {recent} like={[{ block: blocks.wiki }, { words: 'Why do kettles whistle?' }, { block: blocks.arenaImage }]} placed={[blocks.raindrop.url]} linkFrom={['a', 'b', 'c']} onaddlinked={add} onadd={add} onclose={() => {}} /></div>
</Story>
