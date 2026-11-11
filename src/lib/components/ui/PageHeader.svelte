<script lang="ts">
	import type { Snippet } from 'svelte';
	import BackLink from './BackLink.svelte';

	interface Props {
		backHref?: string;
		backText?: string;
		/** A title, pill, or menu that names the page. */
		children: Snippet;
		description?: string;
		/** Less space below, for pages whose first section brings its own. */
		tight?: boolean;
	}

	let { backHref, backText = 'Back', children, description, tight = false }: Props = $props();
</script>

<header class="page-header" class:tight>
	{#if backHref}
		<BackLink href={backHref}>{backText}</BackLink>
	{/if}
	{@render children()}
	{#if description}
		<p class="description">{description}</p>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-7);
	}

	.page-header.tight {
		margin-bottom: var(--space-5);
	}

	.description {
		margin: var(--space-1) 0 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}
</style>
