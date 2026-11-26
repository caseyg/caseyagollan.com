<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Stays at the bottom while the rest scrolls: the composer. */
		footer?: Snippet;
		/** Sets everything in the middle of the pane, for starting a new chat. */
		centered?: boolean;
		as?: 'div' | 'main';
		children: Snippet;
	}

	let { footer, centered = false, as = 'main', children }: Props = $props();
</script>

<!--
	The body of a full-page chat: one centred column that scrolls by itself, beneath the pinned
	trail and navigation so nothing runs under them, with the composer held at the bottom.
	Fills the height its parent gives it (`ChatLayout`'s main area).
-->
<svelte:element this={as} class="chat-pane" class:centered>
	<div class="scroll">
		<div class="column">{@render children()}</div>
	</div>
	{#if footer}<div class="foot"><div class="column">{@render footer()}</div></div>{/if}
</svelte:element>

<style>
	.chat-pane {
		/* The conversation's "Latest" button and its end sit just above the composer here, not above a sticky one. */
		--chat-jump-bottom: var(--space-2);
		--chat-end-margin: 0px;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
		font-size: var(--fs-md);
		line-height: 1.6;
		overflow-wrap: break-word;
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-4) var(--space-5) var(--space-5);
		scrollbar-gutter: stable both-edges;
		scrollbar-width: thin;
	}

	.column {
		box-sizing: border-box;
		width: 100%;
		max-width: var(--chat-measure, 46rem);
		margin: 0 auto;
	}

	.foot {
		padding: 0 var(--space-5) var(--space-4);
		scrollbar-gutter: stable both-edges;
		overflow: hidden;
	}

	.foot .column {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* A new chat: the composer waits in the middle of the page, a little above centre. */
	.centered .scroll {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding-bottom: 18vh;
	}

	@media (max-width: 600px) {
		.chat-pane {
			font-size: var(--fs-base);
		}

		.scroll {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.foot {
			padding: 0 var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
		}

		.centered .scroll {
			justify-content: flex-start;
			padding-bottom: var(--space-4);
		}
	}
</style>
