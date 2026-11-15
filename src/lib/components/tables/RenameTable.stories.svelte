<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '../ui/Button.svelte';
	import RenameTable from './RenameTable.svelte';

	const { Story } = defineMeta({ title: 'Tables/RenameTable', component: RenameTable, tags: ['!autodocs'] });
</script>

<script lang="ts">
	let name = $state('Reading room');
	let open = $state(true);
	let anchor: HTMLElement | null = $state(null);
</script>

<!-- On a table, it opens from the table's name in the trail. -->
<Story asChild name="Open">
	<div bind:this={anchor} class="anchor"><Button variant="secondary" size="sm" onclick={() => (open = true)}>{name}</Button></div>
	<RenameTable {name} {anchor} bind:open onrename={(next) => (name = next)} />
</Story>

<style>
	.anchor { display: inline-block; }
</style>
