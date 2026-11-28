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
	}
</script>

<script lang="ts">
	import VoiceMenu, { type VoiceChoice } from '../ui/VoiceMenu.svelte';

	interface Props {
		voice: VoiceView;
		/** Switches listening on or off. */
		ontoggle?: () => void;
		oncorrect?: (on: boolean) => void;
		onarrange?: (on: boolean) => void;
		oncommands?: (on: boolean) => void;
		/** Whether the options are showing. They open by themselves when there is something to say. */
		open?: boolean;
	}

	let { voice, ontoggle, oncorrect, onarrange, oncommands, open = $bindable(false) }: Props = $props();

	const label = $derived(voice.status === 'listening' ? 'Stop the voice note' : voice.status === 'starting' ? 'Starting the microphone…' : 'Voice note: talk, and your words become text blocks');

	const choices = $derived<VoiceChoice[]>([
		{ key: 'correct', label: 'Correct the text', detail: 'After each pause, a model fixes misheard words and punctuation.', checked: voice.correct },
		{ key: 'arrange', label: 'Lay out and connect', detail: 'Each block is joined by an arrow to the one it follows, and the note is set out as a tree.', checked: voice.arrange },
		...(voice.commands !== undefined ? [{ key: 'commands', label: 'Follow spoken commands', detail: '“Connect these two with an arrow”, “draw a circle next to that”, “make the last one red”: done, not written down.', checked: voice.commands }] : [])
	]);
	const choose = (key: string, on: boolean) => (key === 'correct' ? oncorrect : key === 'arrange' ? onarrange : oncommands)?.(on);

	// What a command did stays a few seconds, then goes. It is shown in the top layer, over the
	// microphone, because the toolbar clips what it holds.
	let did = $state('');
	let root: HTMLElement | undefined = $state();
	let said: HTMLElement | undefined = $state();
	$effect(() => {
		if (!voice.did) return void (did = '');
		did = voice.did.text;
		const gone = setTimeout(() => (did = ''), 4500);
		return () => clearTimeout(gone);
	});
	$effect(() => {
		if (!said || !root) return;
		if (!did) return void (said.matches(':popover-open') && said.hidePopover());
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
	<VoiceMenu status={voice.status} level={voice.level} {label} optionsLabel="Voice note options" {choices} notice={voice.notice} hint="A pause starts a new block. Drop one text block on another to combine them; press Enter inside one to split it." {ontoggle} onchoice={choose} bind:open />
	<span bind:this={said} class="said" popover="manual" role="status">{did}</span>
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
</style>
