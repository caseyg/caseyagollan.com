<script lang="ts" module>
	/** Folded to a pill, floating over the page, or docked beside it as a sidebar. */
	export type ChatOverlayMode = 'minimized' | 'floating' | 'docked';
</script>

<script lang="ts">
	import type { ChatMessage, ChatViewer } from '$lib/chat';
	import { Button, Notice } from '$lib/components/ui';
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
	}

	let { title, messages, viewer, tools = [], mode = $bindable('minimized'), onsend, action = '', returnTo, href, error = null, signinError = null, offline = false, placeholder = 'Ask about this table' }: Props = $props();

	let text = $state('');
	const replies = $derived(messages.filter((message) => message.role === 'assistant').length);
	const working = $derived(messages.at(-1)?.status === 'streaming');
</script>

<!--
	A chat beside something else on the page, such as a table's canvas: a pill when folded,
	a panel floating in the corner, or a sidebar the page makes room for (`data-mode="docked"`).
-->
{#if mode === 'minimized'}
	<button type="button" class="chat-overlay-pill" onclick={() => (mode = 'floating')} aria-label="Open the chat, {title}">
		<span aria-hidden="true">💬</span>
		<span class="pill-label">Chat</span>
		{#if working}<span class="pill-dot" aria-label="writing"></span>{:else if replies}<span class="pill-count">{messages.length}</span>{/if}
	</button>
{:else}
	<section class="chat-overlay" data-mode={mode} aria-label="Chat: {title}">
		<header>
			{#if href}<a class="title" {href}>{title}</a>{:else}<span class="title">{title}</span>{/if}
			<div class="controls">
				<Button variant="icon" size="sm" icon="sidebar" label={mode === 'docked' ? 'Float the chat' : 'Dock the chat beside the page'} pressed={mode === 'docked'} onclick={() => (mode = mode === 'docked' ? 'floating' : 'docked')} />
				<Button variant="icon" size="sm" icon="close" label="Minimize the chat" onclick={() => (mode = 'minimized')} />
			</div>
		</header>
		<div class="scroll">
			<ChatConversation {messages} viewerId={viewer?.id}>
				{#snippet empty()}<p class="empty">Ask about what’s on this table, or{viewer?.owner ? ' ask to add things, set them out or tidy up.' : ' what it’s about.'}</p>{/snippet}
			</ChatConversation>
		</div>
		<footer>
			{#if error}<Notice tone="error">{error}</Notice>{/if}
			{#if offline}<Notice>Reconnecting…</Notice>{/if}
			{#if viewer}
				<ChatPromptInput {viewer} bind:value={text} {onsend} {action} {returnTo} {tools} {placeholder} />
			{:else}
				<ChatSignIn {returnTo} error={signinError} open={!!signinError} />
			{/if}
		</footer>
	</section>
{/if}

<style>
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
		font: inherit;
		font-size: var(--fs-sm);
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

	header {
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

	.empty {
		color: var(--text-muted);
	}

	footer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) var(--space-3);
		border-top: 1px solid var(--border);
	}
</style>
