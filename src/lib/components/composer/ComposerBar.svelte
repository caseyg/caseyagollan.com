<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Leading content: the close button, then the post-type menu or the page's name. */
		children: Snippet;
		/** Trailing actions: menus, Save draft, Publish. */
		actions?: Snippet;
	}

	let { children, actions }: Props = $props();
</script>

<!-- The composer's sticky top bar, shared by /new and the post editor. -->
<header class="composer-bar">
	{@render children()}
	<span class="spacer"></span>
	{@render actions?.()}
</header>

<style>
	.composer-bar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: var(--space-2); margin: calc(-1 * var(--space-4)) 0 var(--space-3); padding: var(--space-3) 0; background: var(--bg-primary); }
	.spacer { flex: 1; }
	@media (max-width: 30rem) { .composer-bar { gap: 0; } }
</style>
