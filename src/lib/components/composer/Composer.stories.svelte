<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Icon, { ICONS, type IconName } from './ComposerIcon.svelte';
	import ComposerBar from './ComposerBar.svelte';
	import ComposerButton from './ComposerButton.svelte';
	import ComposerToolbar from './ComposerToolbar.svelte';
	import ComposerChip from './ComposerChip.svelte';

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
		<ComposerButton variant="icon" icon="close" label="Close" />
		<ComposerButton variant="icon" icon="hash" label="Add tags" />
		<ComposerButton variant="icon" icon="pin" label="Location" pressed />
		<ComposerButton variant="icon" size="sm" icon="close" label="Discard" />
		<ComposerButton>Save draft</ComposerButton>
		<ComposerButton icon="plus">Add leg</ComposerButton>
		<ComposerButton variant="primary">Publish</ComposerButton>
		<ComposerButton variant="primary" disabled>Posting…</ComposerButton>
	</div>
</Story>

<Story name="Bar">
	<ComposerBar>
		<ComposerButton variant="icon" icon="close" label="Close" />
		<span class="kind"><Icon name="note" size={18} /> Edit note</span>
		{#snippet actions()}
			<ComposerButton variant="icon" icon="github" label="Open on GitHub" href="https://github.com/" />
			<ComposerButton variant="icon" icon="share" label="Syndicate" />
			<ComposerButton variant="primary">Save</ComposerButton>
		{/snippet}
	</ComposerBar>
</Story>

<script lang="ts">
	let targets = $state(['bluesky']);
</script>

<Story name="Chips">
	<div class="row" role="group" aria-label="Post to">
		<ComposerChip name="targets" value="bluesky" bind:group={targets}>Bluesky</ComposerChip>
		<ComposerChip name="targets" value="mastodon" bind:group={targets}>Mastodon</ComposerChip>
		<ComposerChip value="off" disabled>Disabled</ComposerChip>
	</div>
</Story>

<Story name="Toolbar">
	<ComposerToolbar>
		<ComposerButton variant="icon" icon="image" label="Add photos" />
		<ComposerButton variant="icon" icon="pin" label="Location" pressed />
		<ComposerButton variant="icon" icon="hash" label="Tags" />
		<ComposerButton variant="icon" icon="sliders" label="More options" />
		{#snippet end()}<ComposerChip value="bluesky" checked>Bluesky</ComposerChip><small>128/300</small>{/snippet}
	</ComposerToolbar>
</Story>

<style>
	.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.icons li { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
	.icons code { color: var(--text-muted); font-size: var(--fs-xs); }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
	.kind { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); }
</style>
