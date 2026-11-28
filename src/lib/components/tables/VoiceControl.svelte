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
	import Switch from '../ui/Switch.svelte';
	import VoiceMenu, { type VoiceChoice } from '../ui/VoiceMenu.svelte';
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

	const label = $derived(voice.status === 'listening' ? 'Stop the voice note' : voice.status === 'starting' ? 'Starting the microphone…' : 'Voice note: talk, and your words become text blocks');

	const choices = $derived<VoiceChoice[]>([
		{ key: 'correct', label: 'Tidy into notes', detail: 'After each pause, a model turns what you said into clean notes, one for each thought.', checked: voice.correct },
		{ key: 'arrange', label: 'Lay out and connect', detail: 'Each block is joined by an arrow to the one it follows, and the note is set out as a tree.', checked: voice.arrange },
		...(voice.commands !== undefined ? [{ key: 'commands', label: 'Follow spoken commands', detail: '“Connect these two with an arrow”, “draw a circle next to that”, “make the last one red”: done, not written down.', checked: voice.commands }] : [])
	]);
	const choose = (key: string, on: boolean) => (key === 'correct' ? oncorrect : key === 'arrange' ? onarrange : oncommands)?.(on);

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
	The table toolbar's voice note: the shared microphone and its choices (`ui/VoiceMenu`), the
	things a finished block can have done to it, and what a spoken command did.
-->
<span bind:this={root} class="voice">
	<VoiceMenu status={voice.status} level={voice.level} {label} optionsLabel="Voice note options" {choices} notice={voice.notice} hint="Just talk: a pause starts a new note. Say “actually, make that…” or “scratch that” to take something back, and “that’s all” to finish. Drop one text block on another to combine them; press Enter inside one to split it." {ontoggle} onchoice={choose} bind:open>
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
	</VoiceMenu>
	{#if voice.usage?.shown}<span class="meter" title="What voice notes have used since this page opened, about">{formatUsd(voice.usage.usd)}</span>{/if}
	<span bind:this={said} class="said" class:thinking={!did && voice.thinking} popover="manual" role="status">{bubble}</span>
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
		animation: voice-thinking 0.8s var(--ease) infinite alternate;
	}

	@keyframes voice-thinking {
		to {
			opacity: 0.5;
		}
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

	.usage .choice {
		font-weight: var(--fw-medium);
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

	@media (prefers-reduced-motion: reduce) {
		.said.thinking {
			animation: none;
		}
	}
</style>
