<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChatMessage as Message } from '$lib/chat';
	import { Button } from '$lib/components/ui';
	import ChatMessage from './ChatMessage.svelte';

	interface Props {
		messages: Message[];
		/** The viewer's author id, to mark their own messages. */
		viewerId?: string;
		/** Shown when there are no messages yet. */
		empty?: Snippet;
		/** Text-only messages for a narrow chat (see ChatMessage). */
		compact?: boolean;
	}

	let { messages, viewerId, empty, compact = false }: Props = $props();

	let end = $state<HTMLElement>();
	/** Whether the reader is at the end; new text keeps them there, and doesn't pull them back if they scrolled up. */
	let atEnd = $state(true);

	$effect(() => {
		if (!end || typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(([entry]) => { atEnd = entry.isIntersecting; }, { rootMargin: '0px 0px 160px 0px' });
		observer.observe(end);
		return () => observer.disconnect();
	});

	// Follow streaming text while the reader is at the end.
	const last = $derived(messages.at(-1));
	const size = $derived(`${messages.length}:${last?.content.length ?? 0}:${last?.tools?.length ?? 0}`);
	// At most once a frame: each scroll makes the browser lay the page out, and replies arrive a few words at a time.
	let follow = 0;
	$effect(() => {
		void size;
		if (!atEnd || follow || !end) return;
		follow = requestAnimationFrame(() => {
			follow = 0;
			if (!end) return;
			const scroller = scrollParent(end);
			// In a scrolling box, scroll only it; scrollIntoView would also move the page behind it.
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
			else end.scrollIntoView({ block: 'end' });
		});
	});
	$effect(() => () => cancelAnimationFrame(follow));

	let scroller: HTMLElement | null | undefined;
	function scrollParent(element: HTMLElement): HTMLElement | null {
		if (scroller?.isConnected && scroller.contains(element)) return scroller;
		for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
			if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return (scroller = node);
		}
		return (scroller = null);
	}

	const jump = () => end?.scrollIntoView({ block: 'end', behavior: 'smooth' });
</script>

<!-- A thread's messages in order. Stays at the newest while the agent writes, like AI Elements' Conversation. -->
<section class="chat-conversation" class:compact aria-label="Messages" aria-live="polite" aria-busy={last?.status === 'streaming'}>
	{#each messages as message (message.id)}
		<ChatMessage {message} {compact} own={!!viewerId && message.author?.id === viewerId} />
	{:else}
		{@render empty?.()}
	{/each}
	<div class="end" bind:this={end}></div>
	{#if !atEnd && messages.length}
		<div class="jump"><Button size="sm" icon="chevron" onclick={jump}>Latest</Button></div>
	{/if}
</section>

<style>
	.chat-conversation {
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.chat-conversation:not(.compact) > :global(.chat-message + .chat-message) {
		border-top: 1px solid var(--border-subtle);
	}

	.end {
		height: 1px;
		scroll-margin-bottom: 9rem;
	}

	.jump {
		position: sticky;
		bottom: 8.5rem;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.compact .end {
		scroll-margin-bottom: 0;
	}

	.compact .jump {
		bottom: var(--space-2);
	}

	.jump :global(.button) {
		pointer-events: auto;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
	}
</style>
