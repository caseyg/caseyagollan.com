<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Names the list for assistive technology when no heading does. */
		label?: string;
		/** `Row`s. */
		children: Snippet;
	}

	let { label, children }: Props = $props();
</script>

<!-- A list of things with one line each and, at most, one action: passkeys, tokens, shortcuts. -->
<ul class="row-list" aria-label={label}>{@render children()}</ul>

<style>
	.row-list {
		margin: var(--space-4) 0;
		padding: 0;
		border-bottom: 1px solid var(--border-subtle);
		list-style: none;
	}
</style>
