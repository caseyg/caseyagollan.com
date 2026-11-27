<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { chatHref, type ChatThreadSummary } from '$lib/chat';
	import type { ChatSearchResult } from '$lib/chat-search';
	import { sitePalette, usePageCommands } from '$lib/page-commands.svelte';
	import { ConfirmDialog } from '$lib/components/ui';
	import ChatSidebar from './ChatSidebar.svelte';
	import { provideChatManage, type ChatManage } from './manage.svelte';
	import { ChatSidebarState, provideChatSidebar, type SidebarState } from './sidebar.svelte';

	interface Props {
		threads: ChatThreadSummary[];
		currentId?: string;
		now?: number;
		/** Starts open or closed instead of by screen width, for stories. */
		initial?: SidebarState;
		/** The viewer may search chats by what was said in them (Casey only): ⌘K lists and searches chats, and the sidebar offers it. */
		searchable?: boolean;
		/** Casey's archiving and deleting of chats: the list, a chat's header and the archive offer them, and a delete asks here first. */
		manage?: ChatManage;
		/** Where the archived chats are, and whether that is the page being read. */
		archivedHref?: string;
		archivedCurrent?: boolean;
		children: Snippet;
	}

	let { threads, currentId, now, initial = 'auto', searchable = false, manage, archivedHref, archivedCurrent = false, children }: Props = $props();

	// svelte-ignore state_referenced_locally
	provideChatManage(manage);

	// ⌘K on a chat page: the chats by title, and, typing, the ones where the words were said.
	async function search(query: string, signal: AbortSignal) {
		const response = await fetch(`/api/chat?search=${encodeURIComponent(query)}`, { credentials: 'same-origin', cache: 'no-store', signal });
		const body = (response.ok ? await response.json() : null) as { results?: ChatSearchResult[] } | null;
		return (body?.results ?? []).map((result) => ({ value: `go:${chatHref(result.id)}`, label: result.title, hint: result.archived ? `Archived${result.excerpt ? ` · ${result.excerpt}` : ''}` : result.excerpt, icon: result.archived ? '🗄️' : '💬' }));
	}
	usePageCommands(() => [{
		label: 'Chats',
		items: [
			{ value: 'go:/chat', label: 'New chat', icon: '➕', keywords: ['start', 'ask'] },
			...(manage && archivedHref ? [{ value: `go:${archivedHref}`, label: 'Archived chats', icon: '🗄️', keywords: ['archive', 'old', 'hidden'] }] : []),
			...threads.filter((thread) => thread.id !== currentId).slice(0, 40).map((thread) => ({ value: `go:${chatHref(thread.id)}`, label: thread.title, icon: '💬' }))
		],
		...(searchable ? { search } : {})
	}]);

	// svelte-ignore state_referenced_locally
	const sidebar = provideChatSidebar(new ChatSidebarState(initial));
	onMount(() => { if (initial === 'auto') sidebar.restore(); });
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') sidebar.closeIfCovering(); }} />

<!--
	The /chat template, a chat app's: a collapsible list of chats down the left, below the pinned
	trail, and beside it the chat, as tall as the window and beginning beneath the trail and the
	navigation (give it a `ChatPane`, which scrolls by itself). The list is open by default on wide
	screens; on narrow ones it slides over the page.
-->
<div class="chat-layout" data-sidebar={sidebar.state}>
	<div class="panel">
		<ChatSidebar id="chat-sidebar" {threads} {currentId} {now} onsearch={() => { sidebar.closeIfCovering(); sitePalette.open = true; }} onnavigate={() => sidebar.closeIfCovering()}
			onarchive={manage ? (chat) => void manage.archive(chat) : undefined} ondelete={manage ? (chat) => void manage.remove(chat) : undefined}
			archivedHref={manage ? archivedHref : undefined} {archivedCurrent} error={manage?.error} />
	</div>
	<button type="button" class="backdrop" aria-label="Hide chats" tabindex="-1" onclick={() => sidebar.set('auto')}></button>
	<div class="main">{@render children()}</div>
</div>

{#if manage}
	<ConfirmDialog bind:open={() => !!manage.asking, (open) => { if (!open) manage.cancel(); }} title="Delete this chat?" confirm="Delete" error={manage.deleteError} onconfirm={() => manage.confirm()}>
		“{manage.askingTitle}” and everything said in it will be deleted for good. To keep it out of the way instead, archive it.
	</ConfirmDialog>
{/if}

<style>
	.chat-layout {
		--chat-sidebar: 17rem;
		--chat-sidebar-top: calc(var(--nav-lane) + var(--nav-inset) + var(--space-2));
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

	/* The window's height, starting under the trail and navigation: the chat scrolls inside, the page doesn't. */
	.main {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-width: 0;
		height: 100vh;
		height: 100dvh;
		padding-top: var(--chat-sidebar-top);
		/* Reading-scale type, as `Page` sets for the pages it holds; the body's own is the homepage's large fluid type. */
		font-size: var(--fs-md);
		line-height: 1.6;
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
