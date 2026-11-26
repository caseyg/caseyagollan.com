<script lang="ts" module>
	/** Folded to a 💬 button, or open: a sidebar beside the page, or a bottom sheet on narrow screens. */
	export type ChatOverlayMode = 'minimized' | 'docked';
</script>

<script lang="ts">
	import { latestAssistantLine, type ChatMessage, type ChatSelectionItem, type ChatThreadSummary, type ChatViewer } from '$lib/chat';
	import { BottomSheet, Button, Notice } from '$lib/components/ui';
	import ChatConversation from './ChatConversation.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSelection from './ChatSelection.svelte';
	import ChatSignIn from './ChatSignIn.svelte';
	import ChatThreadList from './ChatThreadList.svelte';

	interface Props {
		title: string;
		messages: ChatMessage[];
		viewer: ChatViewer | null;
		/** Tools the assistant has for this viewer, named under the composer. */
		tools?: string[];
		mode?: ChatOverlayMode;
		/** Sends over the live connection; without it the composer's form posts to `action`. */
		onsend?: (text: string) => boolean | Promise<boolean>;
		action?: string;
		/** The page to come back to after signing in or out. */
		returnTo: string;
		/** The thread's own page, for reading it full width. */
		href?: string;
		error?: string | null;
		signinError?: string | null;
		offline?: boolean;
		placeholder?: string;
		/** Docked means a bottom sheet instead of a sidebar, for screens too narrow to share. */
		sheet?: boolean;
		/** The bottom sheet is pulled up; folded, it shows the newest reply's last line and the composer. */
		sheetExpanded?: boolean;
		/** The folded sheet's height in pixels, for the page to keep its content clear of it. */
		sheetRestHeight?: number;
		/** Shown before the first message. */
		intro?: string;
		/** Starts a new chat, from the title bar. */
		onnew?: () => void;
		/** Other chats to flip to, newest first; null until they've loaded. With it, the title bar offers the list. */
		threads?: ChatThreadSummary[] | null;
		/** The list is being opened: load `threads`. */
		onlistthreads?: () => void;
		/** Switch to another chat from the list. */
		onpick?: (id: string) => void;
		/** The chat that's open, marked in the list. */
		current?: string;
		/** What is selected on the table beside the chat: shown above the composer, and what “these” will mean. */
		selection?: ChatSelectionItem[];
		/** Clears that selection. */
		ondeselect?: () => void;
	}

	let { title, messages, viewer, tools = [], mode = $bindable('minimized'), onsend, action = '', returnTo, href, error = null, signinError = null, offline = false, placeholder = '', sheet = false, sheetExpanded = $bindable(true), sheetRestHeight = $bindable(0), intro, onnew, threads, onlistthreads, onpick, current, selection = [], ondeselect }: Props = $props();

	/** Showing the list of chats instead of the conversation. */
	let listing = $state(false);

	let text = $state('');
	const working = $derived(messages.at(-1)?.status === 'streaming');
	const latest = $derived(latestAssistantLine(messages));

	function toggleList() {
		listing = !listing;
		if (listing) {
			onlistthreads?.();
			sheetExpanded = true;
		}
	}

	function pick(id: string) {
		listing = false;
		onpick?.(id);
	}
</script>

{#snippet titleBar()}
	{#if listing}<span class="title">Chats</span>{:else if href}<a class="title" {href}>{title}</a>{:else}<span class="title">{title}</span>{/if}
	<div class="controls">
		{#if onpick}<Button variant="icon" size="sm" icon="properties" label="All chats" pressed={listing} onclick={toggleList} />{/if}
		{#if onnew}<Button variant="icon" size="sm" icon="plus" label="New chat" onclick={() => { listing = false; onnew(); }} />{/if}
		<Button variant="icon" size="sm" icon="close" label="Minimize the chat" onclick={() => (mode = 'minimized')} />
	</div>
{/snippet}

{#snippet conversation()}
	{#if listing}
		{#if threads}<ChatThreadList {threads} {current} onselect={pick} compact />{:else}<p class="empty">Loading…</p>{/if}
	{:else}
	<ChatConversation {messages} viewerId={viewer?.id} compact>
		{#snippet empty()}{#if intro}<p class="empty">{intro}</p>{/if}{/snippet}
	</ChatConversation>
	{/if}
{/snippet}

{#snippet composer()}
	{#if error}<Notice tone="error">{error}</Notice>{/if}
	{#if offline}<Notice>Reconnecting…</Notice>{/if}
	{#if viewer}
		{#if selection.length}<ChatSelection items={selection} onclear={ondeselect ?? (() => {})} />{/if}
		<ChatPromptInput {viewer} bind:value={text} {onsend} {action} {returnTo} {tools} {placeholder} label="Message the assistant" compact />
	{:else}
		<ChatSignIn {returnTo} error={signinError} open={!!signinError} />
	{/if}
{/snippet}

<!--
	A chat beside something else on the page, such as a table's canvas: a round 💬 button when folded,
	or a sidebar the page makes room for (`data-mode="docked"`).
	With `sheet`, docked is a bottom sheet instead, which folds to the newest reply's last line and the
	composer so the page above stays usable, and keeps its place in the conversation while folded.
-->
{#if mode === 'minimized'}
	<button type="button" class="chat-overlay-pill" onclick={() => (mode = 'docked')} aria-label="Open the chat, {title}" title="Chat">
		<span aria-hidden="true">💬</span>
		{#if working}<span class="pill-dot" aria-label="writing"></span>{/if}
	</button>
{:else if mode === 'docked' && sheet}
	<BottomSheet class="chat-overlay chat-overlay--sheet" label="Chat: {title}" bind:expanded={sheetExpanded} bind:restHeight={sheetRestHeight} expandLabel="Show the whole chat" collapseLabel="Fold the chat down to see the table">
		{#snippet header()}<div class="bar">{@render titleBar()}</div>{/snippet}
		{#snippet peek()}
			{#if latest || messages.length}<span class="latest">
				{#if latest?.writing}<span class="pill-dot" aria-label="writing"></span>{/if}
				<span class="line">{latest?.text || title}</span>
			</span>{/if}
		{/snippet}
		{#snippet footer()}<div class="composer">{@render composer()}</div>{/snippet}
		<div class="scroll">{@render conversation()}</div>
	</BottomSheet>
{:else}
	<section class="chat-overlay" data-mode={mode} aria-label="Chat: {title}">
		<header class="bar">{@render titleBar()}</header>
		<div class="scroll">{@render conversation()}</div>
		<footer class="composer">{@render composer()}</footer>
	</section>
{/if}

<style>
	/* Its own type size, whatever the page around it uses (a table's page is scaled for its canvas). */
	.chat-overlay-pill,
	.chat-overlay {
		font-size: var(--fs-base);
	}

	/* A round button with only the speech balloon; a dot on its corner while the assistant writes. */
	.chat-overlay-pill {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		padding: 0;
		font-size: 1.4rem;
		line-height: 1;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-primary);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		color: var(--text-primary);
		font-family: inherit;
		cursor: pointer;
		transition: border-color var(--duration) var(--ease);
	}

	.chat-overlay-pill:hover {
		border-color: var(--border-strong);
	}

	.chat-overlay-pill .pill-dot {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
	}

	.pill-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--text-muted);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}

	.chat-overlay {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.chat-overlay[data-mode='docked'] {
		height: 100%;
		border-left: 1px solid var(--border);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	.title {
		overflow: hidden;
		color: inherit;
		font-size: var(--fs-sm);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: none;
	}

	a.title:hover {
		text-decoration: underline;
	}

	.controls {
		display: flex;
		flex-shrink: 0;
		gap: var(--space-1);
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-1) var(--space-3);
		font-size: var(--fs-sm);
	}

	/* In the sheet, the sheet's body scrolls; this only pads it. */
	:global(.chat-overlay--sheet) .scroll {
		overflow: visible;
	}

	:global(.chat-overlay--sheet) {
		font-size: var(--fs-base);
	}

	:global(.chat-overlay--sheet) .bar {
		border-bottom: 0;
	}

	:global(.chat-overlay--sheet) .composer {
		border-top: 0;
	}

	:global(.chat-overlay--sheet:not(.expanded)) .composer {
		padding-top: 0;
	}

	.latest {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.latest .pill-dot {
		flex-shrink: 0;
		align-self: center;
	}

	/* One or two lines of the newest reply, so the folded sheet stays about the same height. */
	.line {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.empty {
		color: var(--text-muted);
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border-top: 1px solid var(--border);
	}
</style>
