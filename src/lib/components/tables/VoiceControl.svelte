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
		/** A request to change the table is carried out, not written down. Left out, the choice isn't offered. */
		commands?: boolean;
		/** What the last spoken command did; shown by the microphone for a few seconds. */
		did?: { text: string };
		/** A model is considering what was just said: correcting it, or taking it as a command. */
		thinking?: boolean;
		/** What voice notes have used. Left out, nothing about cost is shown. */
		usage?: VoiceUsageView;
	}

	/** Usage as the control shows it: a line per service, the totals, and whether the total sits by the microphone. */
	export interface VoiceUsageView {
		lines: VoiceSpend[];
		/** This page's total, and the calendar month's in this browser. */
		usd: number;
		monthUsd: number;
		/** The running total shows beside the microphone. */
		shown: boolean;
	}
</script>

<script lang="ts">
	import Button from '../ui/Button.svelte';
	import MenuChevron from '../ui/MenuChevron.svelte';
	import Notice from '../ui/Notice.svelte';
	import Popover from '../ui/Popover.svelte';
	import Switch from '../ui/Switch.svelte';
	import { formatUsd, type VoiceSpend } from '$lib/voice-notes';

	interface Props {
		voice: VoiceView;
		/** Switches listening on or off. */
		ontoggle?: () => void;
		oncorrect?: (on: boolean) => void;
		onarrange?: (on: boolean) => void;
		oncommands?: (on: boolean) => void;
		onmeter?: (on: boolean) => void;
		/** Whether the options are showing. They open by themselves when there is something to say. */
		open?: boolean;
	}

	let { voice, ontoggle, oncorrect, onarrange, oncommands, onmeter, open = $bindable(false) }: Props = $props();

	const listening = $derived(voice.status !== 'off');
	const label = $derived(voice.status === 'listening' ? 'Stop the voice note' : voice.status === 'starting' ? 'Starting the microphone…' : 'Voice note: talk, and your words become text blocks');

	// A reason listening stopped is shown where the choices are, without being asked for.
	let told = '';
	$effect(() => {
		if (voice.notice && voice.notice !== told) open = true;
		told = voice.notice ?? '';
	});

	// What a command did stays a few seconds, then goes. It is shown in the top layer, over the
	// microphone, because the toolbar clips what it holds.
	let did = $state('');
	let shown: { text: string } | undefined;
	let root: HTMLElement | undefined = $state();
	let said: HTMLElement | undefined = $state();
	$effect(() => {
		// Each thing done is said once, for a few seconds, even while the next block is being thought about.
		if (!voice.did || voice.did === shown) return;
		shown = voice.did;
		did = voice.did.text;
		const gone = setTimeout(() => (did = ''), 3500);
		return () => clearTimeout(gone);
	});
	const bubble = $derived(did || (voice.thinking ? 'Thinking…' : ''));
	$effect(() => {
		if (!said || !root) return;
		if (!bubble) return void (said.matches(':popover-open') && said.hidePopover());
		const mic = root.getBoundingClientRect();
		said.style.left = `${mic.left + mic.width / 2}px`;
		said.style.bottom = `${window.innerHeight - mic.top + 12}px`;
		if (!said.matches(':popover-open')) said.showPopover();
	});
</script>

<!--
	The table toolbar's voice note: a microphone that is on or off, and beside it the things a
	finished block can have done to it, out of the way until asked for.
-->
<span bind:this={root} class="voice" class:listening data-status={voice.status} style:--level={listening ? (voice.level ?? 0).toFixed(2) : 0}>
	<Button variant="icon" icon="mic" {label} pressed={listening} class="voice-mic" onclick={ontoggle} />
	<span bind:this={said} class="said" class:thinking={!did && voice.thinking} popover="manual" role="status">{bubble}</span>
	{#if voice.usage?.shown}<span class="meter" title="What voice notes have used since this page opened, about">{formatUsd(voice.usage.usd)}</span>{/if}
	<Popover label="Voice note options" hideTitle={false} align="end" bind:open triggerClass="voice-options" panelClass="voice-panel">
		{#snippet trigger()}<MenuChevron split={false} />{/snippet}
		<div class="choices">
			<Switch checked={voice.correct} onCheckedChange={(on: boolean) => oncorrect?.(on)}>
				<span class="choice">Correct the text<small>After each pause, a model fixes misheard words and punctuation.</small></span>
			</Switch>
			<Switch checked={voice.arrange} onCheckedChange={(on: boolean) => onarrange?.(on)}>
				<span class="choice">Lay out and connect<small>Each block is joined by an arrow to the one it follows, and the note is set out as a tree.</small></span>
			</Switch>
			{#if voice.commands !== undefined}
				<Switch checked={voice.commands} onCheckedChange={(on: boolean) => oncommands?.(on)}>
					<span class="choice">Follow spoken commands<small>“Connect these two with an arrow”, “draw a circle next to that”, “make the last one red”: done, not written down.</small></span>
				</Switch>
			{/if}
		</div>
		{#if voice.usage}
			{@const usage = voice.usage}
			<div class="usage">
				<Switch checked={usage.shown} onCheckedChange={(on: boolean) => onmeter?.(on)}>
					<span class="choice">Show the running cost</span>
				</Switch>
				<dl>
					{#each usage.lines as line (line.service)}
						<div><dt>{line.service}<small>{line.amount}</small></dt><dd>{line.usd ? formatUsd(line.usd) : 'free'}</dd></div>
					{:else}
						<div><dt><small>Nothing used since this page opened.</small></dt><dd></dd></div>
					{/each}
					<div class="sum"><dt>Since this page opened</dt><dd>{formatUsd(usage.usd)}</dd></div>
					<div class="sum"><dt>This month, in this browser</dt><dd>{formatUsd(usage.monthUsd)}</dd></div>
				</dl>
				<small>Approximate, from each service’s listed prices.</small>
			</div>
		{/if}
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

	/* What a command did: a small label over the microphone, in the top layer. */
	.said {
		position: fixed;
		inset: auto;
		margin: 0;
		translate: -50% 0;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: var(--fs-xs);
		white-space: nowrap;
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		pointer-events: none;
	}

	.said.thinking {
		color: var(--text-muted);
		animation: voice-wait 0.8s var(--ease) infinite alternate;
	}

	/* The running cost: small figures beside the microphone. */
	.meter {
		padding: 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.usage {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-1);
		padding: var(--space-3) var(--space-2) var(--space-2);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--fs-sm);
	}

	.usage :global(.switch) {
		align-items: start;
	}

	.usage dl {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		font-size: var(--fs-xs);
	}

	.usage dl div {
		display: flex;
		gap: var(--space-3);
		align-items: baseline;
		justify-content: space-between;
	}

	.usage dt {
		display: grid;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.usage dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.usage .sum {
		font-weight: var(--fw-medium);
	}

	.usage small {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
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
		max-height: min(34rem, calc(100dvh - 7rem));
		overflow-y: auto;
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

		.voice[data-status='starting'] :global(.voice-mic),
		.said.thinking {
			animation: none;
		}
	}
</style>
