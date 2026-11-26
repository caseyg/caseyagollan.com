<script lang="ts">
	import { CHAT_MAX_MESSAGE, PROVIDER_LABELS, type ChatSendOptions, type ChatViewer } from '$lib/chat';
	import { Avatar, Button } from '$lib/components/ui';
	import { Textarea } from '@ui-sdk/svelte/textarea';
	import type { ChatToolChoices } from '$lib/chat-tool-groups';
	import ChatToolsMenu from './ChatToolsMenu.svelte';

	interface Props {
		viewer: ChatViewer;
		/** Where the form posts without JavaScript. */
		action?: string;
		placeholder?: string;
		/**
		 * Sends the text; resolve true once it went, false to keep it in the box. Without it the form posts.
		 * Enter sends. With Cmd held (Ctrl off a Mac) it sends with `queue`: to be answered after the
		 * answer being written, not to join it. While that key is down, Send shows a plus.
		 */
		onsend?: (text: string, options: ChatSendOptions) => boolean | Promise<boolean>;
		/** Show Send as it is with Cmd held, for stories. */
		queueing?: boolean;
		/** Writing is paused, such as while the connection comes back. */
		disabled?: boolean;
		/** Opens expanded, for starting a new chat. */
		open?: boolean;
		value?: string;
		/** Page to come back to after signing out. */
		returnTo?: string;
		/** Tools the agent has for this viewer, named under the box once it's open. */
		tools?: string[];
		/** Casey's Tools menu: the groups of tools in this chat and what is off. Left out, there is no menu. */
		choices?: ChatToolChoices | null;
		onchoices?: (off: string[]) => void;
		/** One box and a send button, nothing else: no picture, no “Writing as”, no tools line. */
		compact?: boolean;
		/** The box's accessible name when it shows no placeholder. */
		label?: string;
	}

	let { viewer, action = '', placeholder = 'Write a message', onsend, disabled = false, open = $bindable(false), value = $bindable(''), returnTo = '/chat', tools = [], compact = false, label = 'Message', queueing = false, choices = null, onchoices }: Props = $props();

	let sending = $state(false);
	const tooLong = $derived(value.length > CHAT_MAX_MESSAGE);
	const ready = $derived(!!value.trim() && !tooLong && !sending && !disabled);

	/** Cmd on a Mac, Ctrl elsewhere: held, the next send waits its turn. */
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const modifier = (event: KeyboardEvent | MouseEvent) => (mac ? event.metaKey : event.ctrlKey);
	let held = $state(false);
	const queue = $derived(held || queueing);

	async function submit(event: SubmitEvent) {
		if (!onsend) return;
		event.preventDefault();
		if (!ready) return;
		sending = true;
		try { if (await onsend(value.trim(), { queue })) value = ''; } finally { sending = false; }
	}

	function keydown(event: KeyboardEvent) {
		// Enter sends; Shift+Enter starts a new line.
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			held = modifier(event);
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
		if (event.key === 'Escape' && !value) open = false;
	}

	const sendIcon = $derived(queue ? 'plus' : 'send');
	const sendLabel = $derived(queue ? 'Send after this answer' : 'Send');

	const TOOL_NAMES: Record<string, string> = { search_site: 'search the site', fetch_page: 'read pages', show_page: 'show page previews', view_image: 'look at pictures', table_read: 'look at this table', table: 'change this table', micropub: 'post to your site (drafts)' };
	const toolText = $derived(tools.map((tool) => TOOL_NAMES[tool] ?? tool).join(', '));
</script>

<svelte:window onkeydown={(event) => (held = modifier(event))} onkeyup={(event) => (held = modifier(event))} onblur={() => (held = false)} />

<!-- The composer: one quiet line until it's used, then the box, who you are, and Send. Compact, it's only the box and Send. -->
<form class="chat-prompt" class:open={open && !compact} class:compact method="POST" {action} onsubmit={submit}>
	<div class="box">
		{#if !compact}<Avatar src={viewer.photo} name={viewer.name} size="sm" />{/if}
		{#if choices && onchoices && viewer.owner}<ChatToolsMenu {choices} onchange={onchoices} />{/if}
		<Textarea
			class="input"
			name="text"
			bind:value
			{placeholder}
			rows={open && !compact ? 3 : 1}
			autoResize
			maxlength={CHAT_MAX_MESSAGE + 200}
			aria-label={placeholder || label}
			onfocus={() => (open = true)}
			onkeydown={keydown}
		/>
		{#if compact && tooLong}<span class="limit">{value.length} / {CHAT_MAX_MESSAGE}</span>{/if}
		{#if !open || compact}<Button class="send" variant={compact ? 'primary' : 'icon'} size="sm" icon={sendIcon} label={sendLabel} aria-label={sendLabel} type="submit" disabled={!ready} />{/if}
	</div>
	{#if open && !compact}
		<div class="footer">
			<span class="as">
				{viewer.owner ? 'Writing as Casey' : `${viewer.name} via ${PROVIDER_LABELS[viewer.via]}`}
				{#if toolText}<span class="tools">· The assistant can {toolText}</span>{/if}
			</span>
			{#if tooLong}<span class="limit">{value.length} / {CHAT_MAX_MESSAGE}</span>{/if}
			{#if !viewer.owner}
				<Button variant="quiet" size="sm" type="submit" formaction="/chat/logout" formnovalidate name="return" value={returnTo}>Sign out</Button>
			{/if}
			<Button variant="primary" size="sm" icon={sendIcon} label={sendLabel} type="submit" disabled={!ready}>Send</Button>
		</div>
	{/if}
</form>

<style>
	.chat-prompt {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		transition: border-color var(--duration) var(--ease);
	}

	.chat-prompt.compact {
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border-radius: var(--radius-lg);
	}

	/* The Tools menu's button sits where the box's own padding was. */
	.compact:has(:global(.chat-tools-trigger)) {
		padding-left: var(--space-1);
	}

	.compact .box {
		align-items: flex-end;
	}

	.compact .box :global(.input) {
		min-height: 1.75rem;
		padding: 0.2rem 0;
	}

	/* Send: a round button that only takes colour once there's something to send. */
	.compact :global(.send) {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: var(--radius-full);
	}

	.compact .limit {
		align-self: center;
	}

	.chat-prompt:focus-within {
		border-color: var(--border-strong);
	}

	.box {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.box :global(.avatar) {
		margin-top: 0.1rem;
	}

	.box :global(.input) {
		flex: 1;
		min-width: 0;
		min-height: 2rem;
		max-height: 16rem;
		padding: 0.3rem 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		line-height: var(--lh-normal);
		resize: none;
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.as {
		flex: 1;
		min-width: 10rem;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.limit {
		color: var(--text-secondary);
		font-size: var(--fs-xs);
	}
</style>
