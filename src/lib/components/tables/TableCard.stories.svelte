<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, tableSummary } from '$lib/storybook/fixtures';
	import TableCard from './TableCard.svelte';
	import TableGrid from './TableGrid.svelte';
	import { tableWireframe } from '$lib/table-wireframe';

	const { Story } = defineMeta({ title: 'Tables/TableCard', component: TableCard, tags: ['!autodocs'] });

	/** A table's picture as the server draws it: blocks as boxes where they sit, arrows as curves. */
	const shape = (id: string, x: number, y: number, w = 240, h = 160) => ({ id, typeName: 'shape', type: 'site-block', x, y, props: { w, h } });
	const arrow = (id: string, from: string, to: string) => [
		{ id, typeName: 'shape', type: 'arrow', x: 0, y: 0, props: {} },
		{ id: `binding:${id}a`, typeName: 'binding', type: 'arrow', fromId: id, toId: from, props: { terminal: 'start' } },
		{ id: `binding:${id}b`, typeName: 'binding', type: 'arrow', fromId: id, toId: to, props: { terminal: 'end' } }
	];
	const records = [shape('shape:a', 0, 200), shape('shape:b', 400, 0), shape('shape:c', 400, 220), shape('shape:d', 400, 440, 180, 300), ...arrow('shape:x', 'shape:a', 'shape:b'), ...arrow('shape:y', 'shape:a', 'shape:c'), ...arrow('shape:z', 'shape:a', 'shape:d')];
	const picture = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tableWireframe({ schema: {}, store: Object.fromEntries(records.map((r) => [r.id, r])) })!)}`;
</script>

<Story asChild name="Default">
	<div class="one"><TableCard table={tableSummary} href="#table" /></div>
</Story>

<!-- With its picture: the table as it is laid out, arrows and all, in the manner of Obsidian's Canvas previews. -->
<Story asChild name="With picture">
	<div class="one"><TableCard table={tableSummary} href="#table" thumbnail={picture} /></div>
</Story>

<!-- A picture that fails to load falls back to the first blocks. -->
<Story asChild name="Broken picture">
	<div class="one"><TableCard table={tableSummary} href="#table" thumbnail="/missing.svg" /></div>
</Story>

<!-- A draft, as the owner sees it on the browse page; visitors don't see it at all. -->
<Story asChild name="Draft">
	<div class="one"><TableCard table={{ ...tableSummary, published: false }} href="#table" /></div>
</Story>

<Story asChild name="New and empty">
	<div class="one"><TableCard table={{ ...tableSummary, name: 'Untitled table', count: 0, preview: [] }} href="#table" /></div>
</Story>

<!-- The browse page: cards fill the row, newest change first. -->
<Story asChild name="Grid">
	<TableGrid
		tables={[
			tableSummary,
			{ ...tableSummary, id: 'b', name: 'Library of Babel, but small', count: 2, preview: [blocks.book, blocks.bookNoCover] },
			{ ...tableSummary, id: 'c', name: 'Untitled table', count: 0, preview: [] },
			{ ...tableSummary, id: 'd', name: 'A table with a long name that wraps onto a second line', count: 1, preview: [blocks.wiki] }
		]}
		href={(id) => `#${id}`}
	/>
</Story>

<!-- As the owner sees it: the first place starts a new table. Gray, not blue: blue is the navigation's. -->
<Story asChild name="Grid, with New table">
	<TableGrid
		tables={[
			tableSummary,
			{ ...tableSummary, id: 'b', name: 'Library of Babel, but small', count: 2, preview: [blocks.book, blocks.bookNoCover], published: false },
			{ ...tableSummary, id: 'c', name: 'Untitled table', count: 0, preview: [] }
		]}
		href={(id) => `#${id}`}
		onNew={() => {}}
	/>
</Story>

<!-- The owner's first visit: only the place to start one. -->
<Story asChild name="Grid, New table only">
	<TableGrid tables={[]} href={(id) => `#${id}`} onNew={() => {}} />
</Story>

<Story asChild name="Grid, no tables">
	<TableGrid tables={[]} href={(id) => `#${id}`} />
</Story>

<style>
	.one { width: 18rem; }
</style>
