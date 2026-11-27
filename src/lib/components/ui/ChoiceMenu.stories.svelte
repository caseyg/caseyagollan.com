<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChoiceMenu, { type Choice } from './ChoiceMenu.svelte';

	const choices: Choice[] = [
		{ value: 'sidebar', label: 'Sidebar', icon: 'panel-right' },
		{ value: 'floating', label: 'Floating', icon: 'floating' },
		{ value: 'fullscreen', label: 'Full screen', icon: 'fullscreen' }
	];

	const { Story } = defineMeta({
		title: 'Primitives/ChoiceMenu',
		component: ChoiceMenu,
		parameters: { docs: { story: { height: '220px' } } },
		args: { label: 'Where the chat sits', choices, value: 'sidebar', align: 'start' }
	});
</script>

<script lang="ts">
	let value = $state('sidebar');
</script>

<!-- A round button showing the choice in effect; it opens a menu of the others, the current one checked. Arrow keys, typeahead and Escape work as in any menu. -->
<Story name="Choosing">
	{#snippet template(args)}
		<ChoiceMenu {...args} bind:value />
		<p>In effect: {value}</p>
	{/snippet}
</Story>

<Story name="Second choice in effect" args={{ value: 'floating' }} />

<!-- With `text` the button reads as the choice in effect. Choices can carry a second line and sit under headings. -->
<Story
	name="Text button with groups"
	parameters={{ docs: { story: { height: '360px' } } }}
	args={{
		label: 'Paper',
		text: true,
		value: 'a4',
		choices: [
			{ value: 'a4', label: 'A4 paper', short: 'A4', detail: '210 × 297 mm', group: 'International' },
			{ value: 'a5', label: 'A5', detail: '148 × 210 mm', group: 'International' },
			{ value: 'letter', label: 'Letter', detail: '8.5 × 11 in', group: 'North America' },
			{ value: 'legal', label: 'Legal', detail: '8.5 × 14 in', group: 'North America' }
		]
	}}
/>
