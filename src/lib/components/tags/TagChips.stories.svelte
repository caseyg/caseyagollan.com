<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { TagView } from '$lib/tag-edits';
	import TagChips from './TagChips.svelte';

	const { Story } = defineMeta({ title: 'Tags/TagChips', component: TagChips, tags: ['!autodocs'] });

	const kept: TagView[] = [{ name: 'indieweb', state: 'kept' }, { name: 'tables', state: 'kept' }, { name: 'changelog', state: 'kept' }];
	const staged: TagView[] = [{ name: 'indieweb', state: 'kept' }, { name: 'misc', state: 'removed' }, { name: 'tools for thought', state: 'added' }];
	const many: TagView[] = ['indieweb', 'tables', 'changelog', 'micropub', 'tldraw', 'design systems', 'reading', 'tools for thought'].map((name) => ({ name, state: 'kept' }));
	let toggled = $state('Press a tag.');
</script>

<Story name="As they are" args={{ tags: kept }} />

<!-- Staged changes: one tag about to be removed, one about to be added. -->
<Story name="Staged changes" args={{ tags: staged }} />

<!-- The strip along the bottom of a card: one line, fading out where it runs out of room. -->
<Story asChild name="Clipped to one line">
	<div style="width: 15rem; padding: var(--space-2); border: 1px solid var(--border);"><TagChips tags={many} clip /></div>
</Story>

<Story asChild name="Pressable">
	<TagChips tags={staged} ontoggle={(tag) => (toggled = `${tag.state === 'removed' ? 'Keep' : 'Remove'} ${tag.name}`)} />
	<p style="font-size: var(--fs-sm); color: var(--text-muted);">{toggled}</p>
</Story>

<Story name="None" args={{ tags: [] }} />
