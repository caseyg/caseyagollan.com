<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MindMapHelp from './MindMapHelp.svelte';

	const { Story } = defineMeta({ title: 'Tables/MindMapHelp', component: MindMapHelp, tags: ['!autodocs'] });
</script>

<!-- The keys of mind map mode, as a Mac prints them. Press ? to hide and show the list. -->
<Story asChild name="Mac">
	<MindMapHelp active open mac />
</Story>

<!-- The same on a keyboard that spells its modifiers out. -->
<Story asChild name="Other keyboards">
	<MindMapHelp active open mac={false} />
</Story>

<!-- Hidden until ? is pressed. -->
<Story asChild name="Closed">
	<p class="hint">Press ? to list the keys.</p>
	<MindMapHelp active />
</Story>

<style>
	.hint { color: var(--text-secondary); font-size: var(--fs-sm); }
</style>
