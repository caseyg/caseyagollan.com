<script lang="ts">
	import { Button } from '$lib/components/ui';

	interface Props {
		/** Other visitors on the page. */
		others: number;
		/** Whether your pointer is on the page, so you can chat by it. Never on a touch screen. */
		canChat?: boolean;
		onclick?: () => void;
		/** Float in the page's bottom-right corner. Off only to show it in place, in stories. */
		floating?: boolean;
	}

	let { others, canChat = false, onclick, floating = true }: Props = $props();
</script>

<!-- How many others are reading this page, and the key that opens cursor chat. -->
<div class="presence" class:floating>
	<Button size="sm" icon="chat" {onclick} disabled={!canChat} aria-keyshortcuts={canChat ? 'C' : undefined}>
		{others === 1 ? '1 other here' : `${others} others here`}{#if canChat}<span class="hint"> · Press C to chat</span>{/if}
	</Button>
</div>

<style>
	.presence :global(.button) {
		background: var(--bg-primary);
	}

	.presence :global(.button[data-disabled]) {
		opacity: 1;
		cursor: default;
	}

	.hint {
		color: var(--text-muted);
	}

	.floating {
		position: fixed;
		right: calc(var(--nav-inset) + env(safe-area-inset-right));
		bottom: calc(var(--nav-inset) + env(safe-area-inset-bottom));
		z-index: var(--z-nav);
	}
</style>
