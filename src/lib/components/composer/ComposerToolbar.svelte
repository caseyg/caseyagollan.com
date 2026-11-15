<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { Toolbar } from '@ui-sdk/svelte/toolbar';

	interface Props {
		/** Icon buttons that reveal optional fields. */
		children: Snippet;
		/** Right-aligned: share chips, character count. */
		end?: Snippet;
		label?: string;
	}

	let { children, end, label = 'Add to post' }: Props = $props();

	// Buttons inside join the toolbar: one tab stop, with arrow keys between them.
	setContext('ui:toolbar', true);
</script>

<!-- The composer's sticky bottom toolbar, shared by /new and the post editor. -->
<Toolbar class="composer-toolbar" aria-label={label}>
	{@render children()}
	<span class="spacer"></span>
	{@render end?.()}
</Toolbar>

<style>
	:global(.composer-toolbar) { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-top: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid var(--border-subtle); background: var(--bg-primary); }
	.spacer { flex: 1; }
</style>
