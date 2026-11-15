<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Icon, { ICONS, type IconName } from '../ui/Icon.svelte';
	import ComposerBar from './ComposerBar.svelte';
	import Button from '../ui/Button.svelte';
	import ComposerToolbar from './ComposerToolbar.svelte';
	import CheckboxGroup from '../ui/CheckboxGroup.svelte';
	import ToggleChip from '../ui/ToggleChip.svelte';

	const { Story } = defineMeta({ title: 'Composer/Parts', tags: ['!autodocs'] });
	const names = Object.keys(ICONS) as IconName[];
</script>

<Story name="Icons">
	<ul class="icons">
		{#each names as name (name)}<li><Icon {name} /><code>{name}</code></li>{/each}
	</ul>
</Story>

<Story name="Buttons">
	<div class="row">
		<Button variant="icon" icon="close" label="Close" />
		<Button variant="icon" icon="hash" label="Add tags" />
		<Button variant="icon" icon="pin" label="Location" pressed />
		<Button variant="icon" size="sm" icon="close" label="Discard" />
		<Button variant="quiet">Save draft</Button>
		<Button variant="quiet" icon="plus">Add leg</Button>
		<Button variant="primary">Publish</Button>
		<Button variant="primary" disabled>Posting…</Button>
	</div>
</Story>

<Story name="Bar">
	<ComposerBar>
		<Button variant="icon" icon="close" label="Close" />
		<span class="kind"><Icon name="note" size={18} /> Edit note</span>
		{#snippet actions()}
			<Button variant="icon" icon="github" label="Open on GitHub" href="https://github.com/" />
			<Button variant="icon" icon="share" label="Syndicate" />
			<Button variant="primary">Save</Button>
		{/snippet}
	</ComposerBar>
</Story>

<script lang="ts">
	let targets = $state(['bluesky']);
</script>

<Story name="Chips">
	<CheckboxGroup layout="row" label="Post to" name="targets" bind:value={targets}>
		<ToggleChip value="bluesky">Bluesky</ToggleChip>
		<ToggleChip value="mastodon">Mastodon</ToggleChip>
		<ToggleChip value="off" disabled>Disabled</ToggleChip>
	</CheckboxGroup>
</Story>

<Story name="Toolbar">
	<ComposerToolbar>
		<Button variant="icon" icon="image" label="Add photos" />
		<Button variant="icon" icon="pin" label="Location" pressed />
		<Button variant="icon" icon="hash" label="Tags" />
		<Button variant="icon" icon="sliders" label="More options" />
		{#snippet end()}<ToggleChip value="bluesky" pressed>Bluesky</ToggleChip><small>128/300</small>{/snippet}
	</ComposerToolbar>
</Story>

<style>
	.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.icons li { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
	.icons code { color: var(--text-muted); font-size: var(--fs-xs); }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
	.kind { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); }
</style>
