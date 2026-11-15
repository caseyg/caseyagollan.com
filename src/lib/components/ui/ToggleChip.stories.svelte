<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CheckboxGroup from './CheckboxGroup.svelte';
	import ToggleChip from './ToggleChip.svelte';

	const { Story } = defineMeta({ title: 'Primitives/ToggleChip', component: ToggleChip, tags: ['!autodocs'] });
</script>

<script lang="ts">
	let targets = $state(['bluesky']);
</script>

<!-- Checkboxes in a group: the composer's destinations. They submit with the form. -->
<Story asChild name="Checkboxes">
	<CheckboxGroup layout="row" label="Post to" name="targets" bind:value={targets}>
		<ToggleChip value="bluesky">Bluesky</ToggleChip>
		<ToggleChip value="mastodon">Mastodon</ToggleChip>
		<ToggleChip value="threads" disabled>Threads</ToggleChip>
	</CheckboxGroup>
</Story>

<!-- Links to the page with the choice switched: the feed's type filter, which works without JavaScript. -->
<Story asChild name="Links">
	<div class="row">
		<ToggleChip href="#notes" pressed>📝 Notes 73</ToggleChip>
		<ToggleChip href="#articles">📄 Articles 4</ToggleChip>
		<ToggleChip href="#photos" pressed>📷 Photos 12</ToggleChip>
	</div>
</Story>

<style>
	.row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
