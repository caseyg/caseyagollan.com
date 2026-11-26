<script lang="ts">
	import { stepsSummary, type ChatToolUse } from '$lib/chat';
	import { Disclosure, LinkPreviewCard } from '$lib/components/ui';
	import SkillReview from '$lib/components/skills/SkillReview.svelte';
	import ChatTool from './ChatTool.svelte';

	interface Props {
		/** The steps the agent took in a row, between two stretches of its reply. */
		steps: ChatToolUse[];
		/** Supports bind:open. Closed unless the reader opens it. */
		open?: boolean;
	}

	let { steps, open = $bindable(false) }: Props = $props();

	// While one is under way the line says which; done, it sums them up.
	const running = $derived(steps.findLast((step) => step.status === 'running'));
	const line = $derived(stepsSummary(steps));
	const peeks = $derived(steps.filter((step) => step.peek));
	const reviews = $derived(steps.filter((step) => step.skill));
</script>

<!--
	The agent's steps where they happened in its reply. A line sums them up (“Searched the site, read 2
	pages”); it opens to each step, and a step opens to what it was asked and what came back. One step
	alone skips the list. A page the agent chose to show stays in view as a card, as does a skill it
	put up for review.
-->
<div class="chat-steps">
	{#if steps.length === 1}
		<ChatTool step={steps[0]} variant="line" />
	{:else}
		<Disclosure bind:open>
			{#snippet summary()}
				{#if running}<span class="running">{running.label}…</span>{:else}{line}{/if}
			{/snippet}
			<ol>
				{#each steps as step, index (index)}
					<li><ChatTool {step} /></li>
				{/each}
			</ol>
		</Disclosure>
	{/if}
	{#each peeks as step (step.peek?.url)}
		{#if step.peek}<LinkPreviewCard class="peek" href={step.peek.url} title={step.peek.title} excerpt={step.peek.excerpt} />{/if}
	{/each}
	<!-- A skill the agent drafted or fetched, for Casey to read and add. -->
	{#each reviews as step (step.skill?.id)}
		{#if step.skill}<SkillReview skill={step.skill} />{/if}
	{/each}
</div>

<style>
	.chat-steps {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		min-width: 0;
		margin: var(--space-2) 0;
	}

	.chat-steps > :global(.disclosure) {
		width: 100%;
	}

	/* A page the assistant showed sits in the reply, so it needs no popover shadow. */
	.chat-steps :global(.peek) {
		box-shadow: none;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
	}

	li + li {
		border-top: 1px solid var(--border-subtle);
	}

	.running {
		animation: chat-steps-pulse 1.4s var(--ease) infinite;
	}

	@keyframes chat-steps-pulse {
		50% { opacity: 0.45; }
	}

	@media (prefers-reduced-motion: reduce) {
		.running { animation: none; }
	}
</style>
