<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, tableSummary } from '$lib/storybook/fixtures';
	import TableCard from './TableCard.svelte';
	import TableGrid from './TableGrid.svelte';

	const { Story } = defineMeta({ title: 'Tables/TableCard', component: TableCard, tags: ['!autodocs'] });
</script>

<Story asChild name="Default">
	<div class="one"><TableCard table={tableSummary} href="#table" /></div>
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

<Story asChild name="Grid, no tables">
	<TableGrid tables={[]} href={(id) => `#${id}`} />
</Story>

<style>
	.one { width: 18rem; }
</style>
