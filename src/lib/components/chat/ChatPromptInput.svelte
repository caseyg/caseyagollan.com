<script lang="ts">
	import { CHAT_MAX_MESSAGE, PROVIDER_LABELS, type ChatViewer } from '$lib/chat';
	import { Avatar, Button } from '$lib/components/ui';
	import { Textarea } from '@ui-sdk/svelte/textarea';

	interface Props {
		viewer: ChatViewer;
		/** Where the form posts without JavaScript. */
		action?: string;
		placeholder?: string;
		/** Sends the text; resolve true once it went, false to keep it in the box. Without it the form posts. */
		onsend?: (text: string) => boolean | Promise<boolean>;
		/** Writing is paused, such as while the connection comes back. */
		disabled?: boolean;
		/** Opens expanded, for starting a new chat. */
		open?: boolean;
		value?: string;
		/** Page to come back to after signing out. */
		returnTo?: string;
		/** Tools the agent has for this viewer, named under the box once it's open. */
		tools?: string[];
	}

	let { viewer, action = '', placeholder = 'Write a message', onsend, disabled = false, open = $bindable(false), value = $bindable(''), returnTo = '/chat', tools = [] }: Props = $props();

	let sending = $state(false);
	const tooLong = $derived(value.length > CHAT_MAX_MESSAGE);
	const ready = $derived(!!value.trim() && !tooLong && !sending && !disabled);

	async function submit(event: SubmitEvent) {
		if (!onsend) return;
		event.preventDefault();
		if (!ready) return;
		sending = true;
		try { if (await onsend(value.trim())) value = ''; } finally { sending = false; }
	}

	function keydown(event: KeyboardEvent) {
		// Enter sends; Shift+Enter starts a new line.
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
		if (event.key === 'Escape' && !value) open = false;
	}

	const TOOL_NAMES: Record<string, string> = { search_site: 'search the site', fetch_page: 'read pages', show_page: 'show page previews', table_read: 'look at this table', table: 'change this table', micropub: 'post to your site (drafts)' };
	const toolText = $derived(tools.map((tool) => TOOL_NAMES[tool] ?? tool).join(', '));
</script>

<!-- The composer: one quiet line until it's used, then the box, who you are, and Send. -->
<form class="chat-prompt" class:open method="POST" {action} onsubmit={submit}>
	<div class="box">
		<Avatar src={viewer.photo} name={viewer.name} size="sm" />
		<Textarea
			class="input"
			name="text"
			bind:value
			{placeholder}
			rows={open ? 3 : 1}
			autoResize
			maxlength={CHAT_MAX_MESSAGE + 200}
			aria-label={placeholder}
			onfocus={() => (open = true)}
			onkeydown={keydown}
		/>
		{#if !open}<Button variant="icon" size="sm" icon="send" label="Send" type="submit" disabled={!ready} />{/if}
	</div>
	{#if open}
		<div class="footer">
			<span class="as">
				{viewer.owner ? 'Writing as Casey' : `${viewer.name} via ${PROVIDER_LABELS[viewer.via]}`}
				{#if toolText}<span class="tools">· The assistant can {toolText}</span>{/if}
			</span>
			{#if tooLong}<span class="limit">{value.length} / {CHAT_MAX_MESSAGE}</span>{/if}
			{#if !viewer.owner}
				<Button variant="quiet" size="sm" type="submit" formaction="/chat/logout" formnovalidate name="return" value={returnTo}>Sign out</Button>
			{/if}
			<Button variant="primary" size="sm" icon="send" type="submit" disabled={!ready}>{sending ? 'Sending' : 'Send'}</Button>
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
