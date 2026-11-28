<script lang="ts">
	import Button from './Button.svelte';

	interface Props {
		/** `starting` while the microphone and the speech model are being asked for. */
		status?: 'off' | 'starting' | 'listening';
		/** How loud the microphone is, 0 to 1; the ring follows it while listening. */
		level?: number;
		/** Accessible name and tooltip: what a press does now. */
		label: string;
		size?: 'sm' | 'md';
		onclick?: () => void;
		class?: string;
	}

	let { status = 'off', level = 0, label, size = 'md', onclick, class: className = '' }: Props = $props();

	const listening = $derived(status !== 'off');
</script>

<!--
	The microphone that switches listening on and off, wherever speech is taken: a table's voice
	note, the chat's dictation. Listening, it is the site's active blue, with a ring that swells as
	the microphone hears more.
-->
<span class="mic-button" class:listening data-status={status} style:--level={listening ? level.toFixed(2) : 0}>
	<Button variant="icon" {size} icon="mic" {label} pressed={listening} class="mic {className}" {onclick} />
</span>

<style>
	.mic-button {
		display: inline-flex;
		flex: none;
	}

	.mic-button.listening :global(.mic) {
		background: var(--accent);
		color: var(--text-primary);
		box-shadow: 0 0 0 calc(1px + var(--level) * 5px) rgb(255 255 255 / 0.28);
		transition: box-shadow 120ms linear;
	}

	.mic-button[data-status='starting'] :global(.mic) {
		animation: mic-wait 1s var(--ease) infinite alternate;
	}

	@keyframes mic-wait {
		to {
			opacity: 0.5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mic-button.listening :global(.mic) {
			transition: none;
		}

		.mic-button[data-status='starting'] :global(.mic) {
			animation: none;
		}
	}
</style>
