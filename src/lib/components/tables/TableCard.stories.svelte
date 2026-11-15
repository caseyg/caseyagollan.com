<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, tableSummary } from '$lib/storybook/fixtures';
	import TableCard from './TableCard.svelte';
	import TableGrid from './TableGrid.svelte';

	const { Story } = defineMeta({ title: 'Tables/TableCard', component: TableCard, tags: ['!autodocs'] });

	/** A table's picture as the canvas exports it: blocks where they sit, and an arrow between them. */
	const picture = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect x="24" y="24" width="240" height="160" rx="4" fill="gray" stroke="blue" stroke-width="2"/><rect x="380" y="60" width="180" height="300" rx="4" fill="#333"/><rect x="60" y="230" width="240" height="140" rx="4" fill="gray" stroke="blue" stroke-width="2"/><path d="M264 110 C320 110 330 160 378 170" fill="none" stroke="white" stroke-width="3"/></svg>'
	)}`;
</script>

<Story asChild name="Default">
	<div class="one"><TableCard table={tableSummary} href="#table" /></div>
</Story>

<!-- With its picture: the table as it is laid out, arrows and all. -->
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

<Story asChild name="Grid, no tables">
	<TableGrid tables={[]} href={(id) => `#${id}`} />
</Story>

<style>
	.one { width: 18rem; }
</style>
