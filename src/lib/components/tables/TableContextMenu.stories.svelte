<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { TableContextState } from '$lib/table-menus';
	import TableContextMenu from './TableContextMenu.svelte';

	const { Story } = defineMeta({ title: 'Tables/TableContextMenu', parameters: { docs: { story: { height: '620px' } } } });

	const table: TableContextState = { selection: [], tool: 'select', canUndo: true, canRedo: false, auto: true, tags: true, media: true, voice: { status: 'off', correct: true, arrange: false, commands: true }, published: false, post: true, mindMap: false };
	const selected: TableContextState = { ...table, selection: [{ id: 'a', type: 'post' }, { id: 'b', type: 'note' }, { id: 'c', type: 'book' }], details: 'shown', autoLayout: 'tree', mindMap: true };
</script>

<script lang="ts">
	let empty = $state<TableContextMenu>();
	let some = $state<TableContextMenu>();
	let chosen = $state('nothing yet');
	const open = (menu: TableContextMenu | undefined) => (event: MouseEvent) => { event.preventDefault(); void menu?.openAt({ x: event.clientX, y: event.clientY }); };
</script>

<!-- Right-clicking the canvas with nothing selected: everything the toolbar does for the whole table. Layouts, tools, the voice note and Post each open a second menu. -->
<Story asChild name="Nothing selected">
	<div class="area" role="presentation" oncontextmenu={open(empty)}>Right-click anywhere in this box. Chose: {chosen}</div>
	<TableContextMenu bind:this={empty} state={table} onlayout={(layout, scope) => (chosen = `${layout} for the ${scope}`)} ontool={(tool, geo) => (chosen = geo ? `${tool} ${geo}` : tool)} onadd={() => (chosen = 'add')} onmedia={() => {}} onmindmap={(on) => (chosen = on ? 'mind map mode on' : 'mind map mode off')} />
</Story>

<!-- With things selected, what applies to them comes first: lay out the selection, details, tags. Auto layout is on here, so its layout is checked under the whole table; so is mind map mode, which adds a row for its list of keys. -->
<Story asChild name="With a selection">
	<div class="area" role="presentation" oncontextmenu={open(some)}>Right-click anywhere in this box. Chose: {chosen}</div>
	<TableContextMenu bind:this={some} state={selected} onlayout={(layout, scope) => (chosen = `${layout} for the ${scope}`)} ondetails={(shown) => (chosen = shown ? 'show details' : 'hide details')} />
</Story>

<style>
	.area { display: grid; place-items: center; width: 28rem; height: 12rem; border: 1px dashed var(--border-strong); color: var(--text-secondary); font-size: var(--fs-sm); }
</style>
