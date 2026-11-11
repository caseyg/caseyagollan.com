<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'info' | 'error';
		/** Defaults to `alert` for errors and `status` otherwise. */
		role?: 'status' | 'alert' | 'note';
		children: Snippet;
	}

	let { tone = 'info', role, children }: Props = $props();
</script>

<div class="notice notice--{tone}" role={role ?? (tone === 'error' ? 'alert' : 'status')}>
	{@render children()}
</div>

<style>
	.notice {
		margin: var(--space-4) 0;
		padding: var(--space-3) var(--space-4);
		border-left: 2px solid var(--border-strong);
		background: var(--surface-1);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	.notice--error {
		border-left-color: var(--text-primary);
		background: var(--surface-sunken);
	}

	.notice :global(a) {
		color: inherit;
		text-underline-offset: var(--underline-offset);
	}
</style>
