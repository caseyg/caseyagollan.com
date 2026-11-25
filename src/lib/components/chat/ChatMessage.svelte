<script lang="ts">
	import type { ChatMessage } from '$lib/chat';
	import { PROVIDER_LABELS } from '$lib/chat';
	import { Avatar, Icon, Prose } from '$lib/components/ui';
	import { renderContent } from '$lib/utils/renderContent';
	import { createStreamingRenderer } from '$lib/utils/streamingMarkdown';
	import ChatTool from './ChatTool.svelte';

	interface Props {
		message: ChatMessage;
		/** Marks the viewer's own messages. */
		own?: boolean;
		/** Text only, for a narrow chat: your messages as quiet bubbles on the right, answers full width, no names, pictures or times. */
		compact?: boolean;
	}

	let { message, own = false, compact = false }: Props = $props();

	// While it streams, only the block being written is rendered again (and its open bold, code and
	// links closed), so each new word costs one paragraph, not the whole reply. Done, it renders whole.
	const streamBlocks = createStreamingRenderer();
	const streaming = $derived(message.status === 'streaming');
	const blocks = $derived(streaming ? streamBlocks(message.content) : [renderContent(message.content, 'markdown')]);
	const time = $derived(new Date(message.createdAt));
	const author = $derived(message.author);
</script>

<!-- One message: a person's, with their name and how they signed in, or the agent's, with its steps above the answer. -->
<article class="chat-message chat-message--{message.role}" class:own class:compact data-status={message.status}>
	{#if !compact}<div class="who">
		{#if message.role === 'assistant'}
			<span class="agent-mark" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
		{:else}
			<Avatar src={author?.photo} name={author?.name} size="sm" />
		{/if}
	</div>{/if}
	<div class="body">
		{#if !compact}<header>
			{#if message.role === 'assistant'}
				<span class="name">Assistant</span>
				{#if message.model}<span class="meta">{message.model}</span>{/if}
			{:else if author}
				{#if author.url}<a class="name" href={author.url} rel="nofollow ugc">{author.name}</a>{:else}<span class="name">{author.name}</span>{/if}
				<span class="meta">{author.via === 'owner' ? 'site owner' : `via ${PROVIDER_LABELS[author.via]}`}</span>
			{/if}
			<time class="meta" datetime={time.toISOString()}>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
		</header>{/if}
		{#if message.tools?.length}
			<div class="steps">
				{#each message.tools as step, index (index)}<ChatTool {step} />{/each}
			</div>
		{/if}
		{#if message.content}
			<Prose class="text">{#each blocks as block, index (index)}<!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html block}{/each}</Prose>
		{/if}
		{#if message.status === 'streaming'}
			<span class="typing" aria-label="Writing">
				<span></span><span></span><span></span>
			</span>
		{/if}
	</div>
</article>

<style>
	.chat-message {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: var(--space-3);
		padding: var(--space-3) 0;
	}

	.chat-message.compact {
		display: block;
		padding: var(--space-2) 0;
	}

	.compact.chat-message--user .body {
		width: fit-content;
		max-width: 85%;
		margin-left: auto;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
	}

	.compact.chat-message--user .body :global(.text p) {
		margin: 0;
	}

	.agent-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text-secondary);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-1);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.name {
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
		text-decoration: none;
	}

	a.name:hover {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: var(--space-1) 0 var(--space-2);
	}

	.chat-message--user.own .body :global(.text) {
		color: var(--text-primary);
	}

	[data-status='failed'] :global(.text em:last-child) {
		color: var(--text-muted);
	}

	.typing {
		display: inline-flex;
		gap: 3px;
		padding: var(--space-1) 0;
	}

	.typing span {
		width: 5px;
		height: 5px;
		border-radius: var(--radius-full);
		background: var(--text-muted);
		animation: chat-typing 1.2s var(--ease) infinite;
	}

	.typing span:nth-child(2) { animation-delay: 0.15s; }
	.typing span:nth-child(3) { animation-delay: 0.3s; }

	@keyframes chat-typing {
		0%, 60%, 100% { opacity: 0.3; transform: none; }
		30% { opacity: 1; transform: translateY(-2px); }
	}

	@media (prefers-reduced-motion: reduce) {
		.typing span { animation: none; }
	}
</style>
