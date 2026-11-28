<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { onMount } from 'svelte';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';

	const { Story } = defineMeta({ title: 'Primitives/ContextMenu', component: ContextMenu, parameters: { docs: { story: { height: '280px' } } } });

	const items: ContextMenuItem[] = [
		{ value: 'pin', label: 'Always show', hint: 'Keep under Research' },
		{ value: 'block-url', label: 'Never show this link', destructive: true },
		{ value: 'block-domain', label: 'Never show example.com', hint: 'Hides every link from this site', destructive: true }
	];

	const rich: ContextMenuItem[] = [
		{ value: 'layout', label: 'Lay out', icon: 'layout', items: [{ value: 'grid', label: 'Grid', icon: 'layout', keepOpen: true }, { value: 'tree', label: 'Tree', icon: 'layout-tree', checked: true, keepOpen: true }] },
		{ value: 'details', label: 'Hide details', icon: 'properties' },
		{ value: 'add', label: 'Add…', icon: 'plus', group: 'table' },
		{ value: 'auto', label: 'Auto layout', hint: 'Again whenever something is added', icon: 'sparkle', checked: true, group: 'table' },
		{ value: 'undo', label: 'Undo', icon: 'undo', shortcut: '⌘Z', group: 'history' },
		{ value: 'redo', label: 'Redo', icon: 'redo', shortcut: '⇧⌘Z', disabled: true, group: 'history' }
	];
</script>

<script lang="ts">
	let menu: ContextMenu | undefined = $state();
	let openMenu: ContextMenu | undefined = $state();
	let richMenu: ContextMenu | undefined = $state();
	let chosen = $state('nothing yet');
	onMount(() => {
		const box = document.querySelector('[data-story-anchor]')?.getBoundingClientRect();
		if (box) void openMenu?.openAt({ x: box.left + 24, y: box.top + 24 });
	});
</script>

<!-- A menu opened at a point, such as a right-click, built on ui-sdk Menu: arrow keys, typeahead, Escape and outside presses work as in any menu. Destructive items sit after a separator. Call `openAt({ x, y })` from a contextmenu handler. -->
<Story asChild name="Right-click">
	<div class="area" role="presentation" oncontextmenu={(event) => { event.preventDefault(); menu?.openAt({ x: event.clientX, y: event.clientY }); }}>
		Right-click anywhere in this box. Chose: {chosen}
	</div>
	<ContextMenu bind:this={menu} title="example.com" {items} onAction={(value) => (chosen = value)} />
</Story>

<Story asChild name="Open">
	<div class="area" data-story-anchor>Opened from code at this box’s corner.</div>
	<ContextMenu bind:this={openMenu} title="example.com" {items} onAction={() => {}} />
</Story>

<!-- Items can carry icons, key hints and a check, sit in groups divided by separators, and open a second menu beside them. -->
<Story asChild name="Icons, groups and a second menu">
	<div class="area" role="presentation" oncontextmenu={(event) => { event.preventDefault(); richMenu?.openAt({ x: event.clientX, y: event.clientY }); }}>
		Right-click anywhere in this box. Chose: {chosen}
	</div>
	<ContextMenu bind:this={richMenu} title="3 selected" items={rich} onAction={(value) => (chosen = value)} />
</Story>

<style>
	.area { display: grid; place-items: center; width: 24rem; height: 12rem; border: 1px dashed var(--border-strong); color: var(--text-secondary); font-size: var(--fs-sm); }
</style>
