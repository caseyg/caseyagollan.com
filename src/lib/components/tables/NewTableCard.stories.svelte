<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import NewTableCard from './NewTableCard.svelte';

	const { Story } = defineMeta({ title: 'Tables/NewTableCard', component: NewTableCard, tags: ['!autodocs'] });
</script>

<!-- The first place in the browse grid, for whoever can make tables. See Tables/TableCard "Grid, with New table". -->
<Story asChild name="Default">
	<div class="one"><NewTableCard onclick={() => {}} /></div>
</Story>

<!-- After it is pressed, until the new table opens. -->
<Story asChild name="Making a table">
	<div class="one"><NewTableCard onclick={() => {}} busy /></div>
</Story>

<Story asChild name="Phone" globals={{ viewport: { value: 'mobile1' } }}>
	<NewTableCard onclick={() => {}} />
</Story>

<style>
	.one { width: 18rem; }
</style>
