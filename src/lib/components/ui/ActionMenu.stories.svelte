<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ActionMenu, { type ActionItem } from './ActionMenu.svelte';

	const items: ActionItem[] = [
		{ value: 'tidy', label: 'Tidy up', detail: 'Whatever suits' },
		{ value: 'grid', label: 'Grid', detail: 'Aligned', group: 'Rows and columns', keepOpen: true },
		{ value: 'row', label: 'One row', group: 'Rows and columns', keepOpen: true },
		{ value: 'tree', label: 'Tree', group: 'Following the arrows' },
		{ value: 'radial', label: 'Radial', group: 'Following the arrows', disabled: true }
	];

	const tools: ActionItem[] = [
		{ value: 'frame', label: 'Area', icon: 'frame', shortcut: 'F' },
		{ value: 'image', label: 'Picture…', icon: 'image' },
		{ value: 'square', label: 'Rectangle', icon: 'square', shortcut: 'R', group: 'Shapes' },
		{ value: 'circle', label: 'Ellipse', icon: 'circle', shortcut: 'O', group: 'Shapes' },
		{ value: 'more', label: 'More shapes', icon: 'shapes', group: 'Shapes', items: [{ value: 'star', label: 'Star' }, { value: 'heart', label: 'Heart' }] }
	];

	const { Story } = defineMeta({
		title: 'Primitives/ActionMenu',
		component: ActionMenu,
		parameters: { docs: { story: { height: '380px' } } },
		args: { label: 'Layout', icon: 'layout', items }
	});
</script>

<script lang="ts">
	let last = $state('nothing yet');
	let scope = $state('selection');
	let on = $state(false);
</script>

<!-- A split button, its label and a chevron, that opens a menu of things to do under headings. Arrow keys, typeahead and Escape work as in any menu. -->
<Story name="Actions">
	{#snippet template(args)}
		<ActionMenu {...args} onaction={(value) => (last = value)} />
		<p>Chosen: {last}</p>
	{/snippet}
</Story>

<!-- A scope at the top says what the actions apply to; changing it keeps the menu open. -->
<Story name="With a scope">
	{#snippet template(args)}
		<ActionMenu {...args} scope={{ label: 'Lay out', value: scope, choices: [{ value: 'selection', label: '3 selected' }, { value: 'table', label: 'The whole table' }] }} onscope={(value) => (scope = value)} onaction={(value) => (last = `${value} for ${scope}`)} />
		<p>Chosen: {last}</p>
	{/snippet}
</Story>

<!-- A switch for a mode the actions leave on; the action in effect is checked, and the button stays lit. -->
<Story name="With a switch">
	{#snippet template(args)}
		<ActionMenu {...args} toggle={{ label: 'Auto layout', detail: 'Again whenever something is added', checked: on }} ontoggle={(checked) => (on = checked)} current={on ? 'grid' : undefined} pressed={on} />
	{/snippet}
</Story>

<!-- Icon only, for a row of tools: icons, key hints, and a second menu beside an item. -->
<Story name="Icon button with a second menu" args={{ label: 'More tools', icon: 'shapes', iconOnly: true, items: tools }} />
