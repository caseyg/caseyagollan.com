<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Icon buttons that reveal optional fields. */
		children: Snippet;
		/** Right-aligned: share chips, character count. */
		end?: Snippet;
		label?: string;
	}

	let { children, end, label = 'Add to post' }: Props = $props();
</script>

<!-- The composer's sticky bottom toolbar, shared by /new and the post editor. -->
<div class="composer-toolbar" role="toolbar" aria-label={label}>
	{@render children()}
	<span class="spacer"></span>
	{@render end?.()}
</div>

<style>
	.composer-toolbar { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-top: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid var(--border-subtle); background: var(--bg-primary); }
	.spacer { flex: 1; }
</style>
