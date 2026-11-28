<script module lang="ts">
	/** A voice note as its control shows it. */
	export interface VoiceView {
		status: 'off' | 'starting' | 'listening';
		/** How loud the microphone is, 0 to 1; the button's ring follows it. */
		level?: number;
		/** Why listening stopped or couldn't start, or that a model couldn't be asked. */
		notice?: string;
		/** A model fixes what was misheard in each finished block. */
		correct: boolean;
		/** Finished blocks are joined by arrows and set out as a tree. */
		arrange: boolean;
	}
</script>

<script lang="ts">
	import Button from '../ui/Button.svelte';
	import MenuChevron from '../ui/MenuChevron.svelte';
	import Notice from '../ui/Notice.svelte';
	import Popover from '../ui/Popover.svelte';
	import Switch from '../ui/Switch.svelte';

	interface Props {
		voice: VoiceView;
		/** Switches listening on or off. */
		ontoggle?: () => void;
		oncorrect?: (on: boolean) => void;
		onarrange?: (on: boolean) => void;
		/** Whether the options are showing. They open by themselves when there is something to say. */
		open?: boolean;
	}

	let { voice, ontoggle, oncorrect, onarrange, open = $bindable(false) }: Props = $props();

	const listening = $derived(voice.status !== 'off');
	const label = $derived(voice.status === 'listening' ? 'Stop the voice note' : voice.status === 'starting' ? 'Starting the microphone…' : 'Voice note: talk, and your words become text blocks');

	// A reason listening stopped is shown where the choices are, without being asked for.
	let told = '';
	$effect(() => {
		if (voice.notice && voice.notice !== told) open = true;
		told = voice.notice ?? '';
	});
</script>

<!--
	The table toolbar's voice note: a microphone that is on or off, and beside it the two things a
	finished block can have done to it, out of the way until asked for.
-->
<span class="voice" class:listening data-status={voice.status} style:--level={listening ? (voice.level ?? 0).toFixed(2) : 0}>
	<Button variant="icon" icon="mic" {label} pressed={listening} class="voice-mic" onclick={ontoggle} />
	<Popover label="Voice note options" hideTitle={false} align="end" bind:open triggerClass="voice-options" panelClass="voice-panel">
		{#snippet trigger()}<MenuChevron split={false} />{/snippet}
		<div class="choices">
			<Switch checked={voice.correct} onCheckedChange={(on: boolean) => oncorrect?.(on)}>
				<span class="choice">Correct the text<small>After each pause, a model fixes misheard words and punctuation.</small></span>
			</Switch>
			<Switch checked={voice.arrange} onCheckedChange={(on: boolean) => onarrange?.(on)}>
				<span class="choice">Lay out and connect<small>Each block is joined by an arrow to the one it follows, and the note is set out as a tree.</small></span>
			</Switch>
		</div>
		{#if voice.notice}<Notice tone="info">{voice.notice}</Notice>{/if}
		<p class="hint">A pause starts a new block. Drop one text block on another to combine them; press Enter inside one to split it.</p>
	</Popover>
</span>

<style>
	.voice {
		display: inline-flex;
		flex: none;
		align-items: center;
	}

	/* Listening: the site's active blue, with a ring that swells as the microphone hears more. */
	.voice.listening :global(.voice-mic) {
		background: var(--accent);
		color: var(--text-primary);
		box-shadow: 0 0 0 calc(1px + var(--level) * 5px) rgb(255 255 255 / 0.28);
		transition: box-shadow 120ms linear;
	}

	.voice[data-status='starting'] :global(.voice-mic) {
		animation: voice-wait 1s var(--ease) infinite alternate;
	}

	@keyframes voice-wait {
		to {
			opacity: 0.5;
		}
	}

	.voice :global(.voice-options) {
		height: 2.25rem;
		padding: 0 var(--space-1);
	}

	:global(.voice-panel) {
		width: min(20rem, calc(100vw - 2 * var(--space-4)));
		padding: var(--space-2);
	}

	.choices {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-2);
		font-size: var(--fs-sm);
	}

	.choices :global(.switch) {
		align-items: start;
	}

	.choice {
		display: grid;
		gap: 2px;
		font-weight: var(--fw-medium);
	}

	.choice small,
	.hint {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
	}

	.hint {
		margin: var(--space-2);
	}

	.voice :global(.notice),
	:global(.voice-panel .notice) {
		margin: var(--space-2);
	}

	@media (prefers-reduced-motion: reduce) {
		.voice.listening :global(.voice-mic) {
			transition: none;
		}

		.voice[data-status='starting'] :global(.voice-mic) {
			animation: none;
		}
	}
</style>
