<script lang="ts" module>
	/** Folded to a pill, floating over the page, or docked: a sidebar beside it, or a bottom sheet on narrow screens. */
	export type ChatOverlayMode = 'minimized' | 'floating' | 'docked';
</script>

<script lang="ts">
	import { latestAssistantLine, type ChatMessage, type ChatViewer } from '$lib/chat';
	import { BottomSheet, Button, Notice } from '$lib/components/ui';
	import ChatConversation from './ChatConversation.svelte';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import ChatSignIn from './ChatSignIn.svelte';

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
	}

	let { title, messages, viewer, tools = [], mode = $bindable('minimized'), onsend, action = '', returnTo, href, error = null, signinError = null, offline = false, placeholder = 'Ask about this table', sheet = false, sheetExpanded = $bindable(true), sheetRestHeight = $bindable(0) }: Props = $props();

	let text = $state('');
	const replies = $derived(messages.filter((message) => message.role === 'assistant').length);
	const working = $derived(messages.at(-1)?.status === 'streaming');
	const latest = $derived(latestAssistantLine(messages));
	const dockLabel = $derived(mode === 'docked' ? 'Float the chat' : sheet ? 'Dock the chat along the bottom' : 'Dock the chat beside the page');
</script>

{#snippet titleBar()}
	{#if href}<a class="title" {href}>{title}</a>{:else}<span class="title">{title}</span>{/if}
	<div class="controls">
		<Button variant="icon" size="sm" icon="sidebar" label={dockLabel} pressed={mode === 'docked'} onclick={() => (mode = mode === 'docked' ? 'floating' : 'docked')} />
		<Button variant="icon" size="sm" icon="close" label="Minimize the chat" onclick={() => (mode = 'minimized')} />
	</div>
{/snippet}

{#snippet conversation()}
	<ChatConversation {messages} viewerId={viewer?.id}>
		{#snippet empty()}<p class="empty">Ask about what’s on this table, or{viewer?.owner ? ' ask to add things, set them out or tidy up.' : ' what it’s about.'}</p>{/snippet}
	</ChatConversation>
{/snippet}

{#snippet composer()}
	{#if error}<Notice tone="error">{error}</Notice>{/if}
	{#if offline}<Notice>Reconnecting…</Notice>{/if}
	{#if viewer}
		<ChatPromptInput {viewer} bind:value={text} {onsend} {action} {returnTo} {tools} {placeholder} />
	{:else}
		<ChatSignIn {returnTo} error={signinError} open={!!signinError} />
	{/if}
{/snippet}

<!--
	A chat beside something else on the page, such as a table's canvas: a pill when folded,
	a panel floating in the corner, or a sidebar the page makes room for (`data-mode="docked"`).
	With `sheet`, docked is a bottom sheet instead, which folds to the newest reply's last line and the
	composer so the page above stays usable, and keeps its place in the conversation while folded.
-->
{#if mode === 'minimized'}
	<button type="button" class="chat-overlay-pill" onclick={() => (mode = 'floating')} aria-label="Open the chat, {title}">
		<span aria-hidden="true">💬</span>
		<span class="pill-label">Chat</span>
		{#if working}<span class="pill-dot" aria-label="writing"></span>{:else if replies}<span class="pill-count">{messages.length}</span>{/if}
	</button>
{:else if mode === 'docked' && sheet}
	<BottomSheet class="chat-overlay chat-overlay--sheet" label="Chat: {title}" bind:expanded={sheetExpanded} bind:restHeight={sheetRestHeight} expandLabel="Show the whole chat" collapseLabel="Fold the chat down to see the table">
		{#snippet header()}<div class="bar">{@render titleBar()}</div>{/snippet}
		{#snippet peek()}
			<span class="latest">
				{#if latest?.writing}<span class="pill-dot" aria-label="writing"></span>{/if}
				<span class="line">{latest?.text || (messages.length ? title : 'Ask about what’s on this table')}</span>
			</span>
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

	.chat-overlay-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
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

	.pill-count {
		min-width: 1.25rem;
		padding: 0 var(--space-1);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		text-align: center;
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

	.chat-overlay[data-mode='floating'] {
		width: min(24rem, calc(100vw - 2 * var(--space-2)));
		height: min(36rem, 70vh);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		overflow: hidden;
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
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
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
		padding: var(--space-3) var(--space-4);
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
		padding: var(--space-2) var(--space-3) var(--space-3);
		border-top: 1px solid var(--border);
	}
</style>
