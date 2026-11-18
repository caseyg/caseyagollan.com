<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { ChatThreadSummary } from '$lib/chat';
	import ChatSidebar from './ChatSidebar.svelte';
	import { ChatSidebarState, provideChatSidebar, type SidebarState } from './sidebar.svelte';

	interface Props {
		threads: ChatThreadSummary[];
		currentId?: string;
		now?: number;
		/** Starts open or closed instead of by screen width, for stories. */
		initial?: SidebarState;
		children: Snippet;
	}

	let { threads, currentId, now, initial = 'auto', children }: Props = $props();

	// svelte-ignore state_referenced_locally
	const sidebar = provideChatSidebar(new ChatSidebarState(initial));
	onMount(() => { if (initial === 'auto') sidebar.restore(); });
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') sidebar.closeIfCovering(); }} />

<!--
	The /chat template: a collapsible list of chats down the left, below the pinned trail, and
	the page beside it. Open by default on wide screens; on narrow ones it slides over the page.
-->
<div class="chat-layout" data-sidebar={sidebar.state}>
	<div class="panel">
		<ChatSidebar id="chat-sidebar" {threads} {currentId} {now} onnavigate={() => sidebar.closeIfCovering()} />
	</div>
	<button type="button" class="backdrop" aria-label="Hide chats" tabindex="-1" onclick={() => sidebar.set('auto')}></button>
	<div class="main">{@render children()}</div>
</div>

<style>
	.chat-layout {
		--chat-sidebar: 16rem;
		--chat-sidebar-top: calc(var(--nav-lane) + var(--nav-inset) + var(--space-3));
	}

	.panel {
		position: fixed;
		z-index: calc(var(--z-nav) - 1);
		top: var(--chat-sidebar-top);
		bottom: 0;
		left: 0;
		width: var(--chat-sidebar);
		padding-left: var(--nav-inset);
		background: var(--bg-primary);
		transition: transform 160ms ease, visibility 160ms;
	}

	.backdrop {
		display: none;
	}

	.main {
		min-width: 0;
		transition: padding-left 160ms ease;
	}

	/* Hidden: slid away, out of the tab order. */
	.chat-layout[data-sidebar='closed'] .panel {
		visibility: hidden;
		transform: translateX(-100%);
	}

	@media (min-width: 900px) {
		.chat-layout:not([data-sidebar='closed']) .main {
			padding-left: var(--chat-sidebar);
		}
	}

	@media (max-width: 899.98px) {
		.chat-layout[data-sidebar='auto'] .panel {
			visibility: hidden;
			transform: translateX(-100%);
		}

		/* Open on a narrow screen: over the page, which dims behind it. */
		.chat-layout[data-sidebar='open'] .panel {
			box-shadow: 0 0 2rem rgb(0 0 0 / 0.25);
		}

		.chat-layout[data-sidebar='open'] .backdrop {
			position: fixed;
			z-index: calc(var(--z-nav) - 2);
			inset: 0;
			display: block;
			border: 0;
			background: rgb(0 0 0 / 0.25);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel, .main {
			transition: none;
		}
	}
</style>
