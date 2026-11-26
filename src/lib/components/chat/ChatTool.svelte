<script lang="ts">
	import type { ChatToolUse } from '$lib/chat';
	import { Disclosure, JsonView } from '$lib/components/ui';

	interface Props {
		step: ChatToolUse;
		/** `row` in a list of steps; `line` when it is the only step and stands in the reply by itself. */
		variant?: 'row' | 'line';
		/** Supports bind:open. */
		open?: boolean;
	}

	let { step, variant = 'row', open = $bindable(false) }: Props = $props();

	// What the step was about (the words in quotes) reads brighter than what it did.
	const words = $derived(step.label.split(/(“[^”]*”)/).filter(Boolean).map((text) => /^“.*”$/.test(text) ? { text: text.slice(1, -1), subject: true } : { text, subject: false }));
	const details = $derived(!!(step.picture || step.links?.length || step.request?.length || step.response || step.error));
</script>

{#snippet summary()}
	<span class="chat-tool" data-status={step.status}>
		{#each words as word, index (index)}{#if word.subject}<span class="subject">{word.text}</span>{:else}{word.text}{/if}{/each}{step.status === 'running' ? '…' : ''}
		{#if step.status === 'failed'}<span class="failed">didn’t work</span>{/if}
	</span>
{/snippet}

<!-- One step the agent took: what it did in a line, opening to what it saw, what it was asked and what came back. -->
{#if details}
	<Disclosure {variant} bind:open {summary}>
		<div class="chat-tool-details">
			{#if step.picture}
				<a class="picture" href={step.picture.src} target="_blank" rel="nofollow noopener"><img src={step.picture.src} alt={step.picture.alt} loading="lazy" /></a>
			{/if}
			{#if step.links?.length}
				<ul class="links">
					{#each step.links as link (link.url)}
						<li><a href={link.url} rel="nofollow noopener">{link.title}</a></li>
					{/each}
				</ul>
			{/if}
			{#if step.error}
				<section class="panel">
					<h4>Error</h4>
					<p>{step.error}</p>
				</section>
			{/if}
			{#if step.request?.length}
				<section class="panel">
					<h4>Request</h4>
					<dl>
						{#each step.request as row (row.name)}
							<dt>{row.name}</dt>
							<dd>{row.value}</dd>
						{/each}
					</dl>
				</section>
			{/if}
			{#if step.response}
				<section class="panel">
					<h4>Response</h4>
					<JsonView text={step.response} label="Response" />
				</section>
			{/if}
		</div>
	</Disclosure>
{:else}
	<Disclosure {variant} {summary} />
{/if}

<style>
	.subject {
		color: var(--text-primary);
	}

	[data-status='running'] {
		animation: chat-tool-pulse 1.4s var(--ease) infinite;
	}

	.failed {
		margin-inline-start: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
	}

	.chat-tool-details {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.picture {
		display: block;
		max-width: min(100%, 22rem);
	}

	/* Tall tables stay a glance; the link opens the whole picture. */
	.picture img {
		display: block;
		max-width: 100%;
		max-height: 18rem;
		width: auto;
		height: auto;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}

	.links {
		margin: 0;
		padding: 0 0 0 var(--space-4);
	}

	.links li {
		margin: 0.15rem 0;
	}

	a {
		color: var(--text-secondary);
		text-underline-offset: var(--underline-offset);
		overflow-wrap: anywhere;
	}

	.panel {
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--surface-sunken);
	}

	h4 {
		margin: 0 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
	}

	p {
		margin: 0;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	dl {
		display: grid;
		grid-template-columns: minmax(4rem, max-content) minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}

	dt {
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	@keyframes chat-tool-pulse {
		50% { opacity: 0.45; }
	}

	@media (prefers-reduced-motion: reduce) {
		[data-status='running'] { animation: none; }
	}
</style>
