<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
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
	const add = (added: Block[]) => console.log('add', added);
</script>

<Story asChild name="Results">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} query="a" /></div>
</Story>

<Story asChild name="Books, browsing">
	<div class="dock"><BlockPicker {search} onadd={add} onclose={() => {}} filter="book" /></div>
</Story>

<Story asChild name="Empty query">
	<div class="dock"><BlockPicker {search} onadd={add} /></div>
</Story>

<!-- Without a search index (such as `vite dev` before a search build), links still work. -->
<Story asChild name="No search index">
	<div class="dock"><BlockPicker search={unavailable} onadd={add} query="cage" /></div>
</Story>

<style>
	.dock { width: 22rem; height: 36rem; }
</style>
