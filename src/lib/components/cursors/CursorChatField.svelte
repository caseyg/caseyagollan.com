<script lang="ts">
	import { Input } from '@ui-sdk/svelte/input';
	import { CHAT_MAX_LENGTH } from '$lib/cursors';

	interface Props {
		value?: string;
		/** Every keystroke, so others see the message as it's typed. */
		oninput?: () => void;
		onkeydown?: (event: KeyboardEvent) => void;
		onblur?: () => void;
		/** Focuses the field when it appears. */
		autofocus?: boolean;
	}

	let { value = $bindable(''), oninput, onkeydown, onblur, autofocus = false }: Props = $props();

	function focus(node: HTMLElement) {
		if (autofocus) queueMicrotask(() => node.querySelector('input')?.focus());
	}
</script>

<!-- The line you type into, inside your own cursor bubble. Enter keeps it up a moment; Escape takes it down. -->
<span class="cursor-chat" use:focus>
	<Input
		bind:value
		class="cursor-chat-field"
		maxlength={CHAT_MAX_LENGTH}
		placeholder="Say something"
		aria-label="Say something to everyone on this page"
		autocomplete="off"
		enterkeyhint="send"
		{oninput}
		{onkeydown}
		{onblur}
	/>
</span>

<style>
	/* The field grows with what's typed, as the bubbles others see do. */
	.cursor-chat :global(.cursor-chat-field) {
		field-sizing: content;
		width: 100%;
		min-width: 8rem;
		max-width: min(20rem, 70vw);
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		outline: none;
	}

	.cursor-chat :global(.cursor-chat-field::placeholder) {
		color: inherit;
		opacity: 0.7;
	}
</style>
