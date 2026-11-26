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

	/* Beside the chat's round button, when that is in this corner too. */
	:global(body:has(.floating-button[data-corner='bottom-right'])) .floating {
		right: calc(var(--nav-inset) + 2.75rem + var(--space-2) + env(safe-area-inset-right));
	}

	/* Clear of the docked chat: left of its sidebar, above its folded sheet. */
	@media (min-width: 900px) {
		:global(html[data-chat-dock='side']) .floating {
			right: calc(var(--chat-dock-width) + 2 * var(--nav-inset));
		}
	}

	:global(html[data-chat-dock='sheet']) .floating {
		bottom: calc(var(--chat-sheet-rest, 0px) + var(--nav-inset));
		z-index: calc(var(--z-menu) - 1);
	}
</style>
