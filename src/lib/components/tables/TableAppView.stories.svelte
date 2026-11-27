<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import type { Block } from '$lib/tables';
	import type { TableViewLink, ViewTurn } from '$lib/table-view-link';
	import TableAppView from './TableAppView.svelte';

	const { Story } = defineMeta({ title: 'Tables/TableAppView', component: TableAppView, tags: ['!autodocs'] });
	const sample = Object.values(blocks);
	const table = { id: 'calm1234', name: 'Calm technology', document: null };
	const search = async (query: string): Promise<Block[]> => sample.filter((block) => block.title.toLowerCase().includes(query.trim().toLowerCase()));

	/** A site that saves at once and asks for nothing, then (for `turns`) hands the view what a table tool would. */
	function link(turns: ViewTurn[] = []): TableViewLink {
		const waiting = [...turns];
		return {
			save: async (patch) => ({ name: patch.name ?? table.name }),
			next: () => new Promise((resolve) => setTimeout(() => resolve(waiting.shift() ?? {}), waiting.length ? 600 : 15_000)),
			done: async () => {}
		};
	}
	const note = (id: string, text: string, x: number): ViewTurn => ({ op: { type: 'table:op', id, op: 'add_note', text, at: { x, y: 0 } } });
</script>

<script lang="ts">
	let full = $state(false);
</script>

<!-- A table as Claude shows it after table_open: the canvas, its name linking to the site, and the tools. -->
<Story name="Open in Claude" parameters={{ layout: 'fullscreen' }}>
	{#snippet template()}
		<TableAppView {table} origin="https://caseyagollan.com" link={link()} {search} display={{ full, toggle: () => (full = !full) }} />
	{/snippet}
</Story>

<!-- The table tools at work: each change arrives through the link and is drawn as Casey watches. -->
<Story name="Taking changes" parameters={{ layout: 'fullscreen' }}>
	{#snippet template()}
		<TableAppView {table} origin="https://caseyagollan.com" link={link([note('1', 'Added by a table tool', 0), note('2', 'And another', 240)])} {search} />
	{/snippet}
</Story>

<!-- A connection that may only read: the canvas pans and zooms, and there are no tools. -->
<Story name="Read only" parameters={{ layout: 'fullscreen' }}>
	{#snippet template()}
		<TableAppView {table} origin="https://caseyagollan.com" link={link()} {search} editable={false} />
	{/snippet}
</Story>

<!-- The same table was opened again later in the conversation: this view stops taking changes. -->
<Story name="Replaced by a newer view" parameters={{ layout: 'fullscreen' }}>
	{#snippet template()}
		<TableAppView {table} origin="https://caseyagollan.com" link={link([{ replaced: true }])} {search} />
	{/snippet}
</Story>
