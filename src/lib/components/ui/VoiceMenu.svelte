<script module lang="ts">
	/** Something listening can do with what it hears, switched on or off. */
	export interface VoiceChoice {
		key: string;
		label: string;
		/** A sentence on what it does. */
		detail?: string;
		checked: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import MenuChevron from './MenuChevron.svelte';
	import MicButton from './MicButton.svelte';
	import Notice from './Notice.svelte';
	import Popover from './Popover.svelte';
	import Switch from './Switch.svelte';

	interface Props {
		status?: 'off' | 'starting' | 'listening';
		/** How loud the microphone is, 0 to 1. */
		level?: number;
		/** What a press of the microphone does now. */
		label: string;
		/** Names the options' button and heads their panel. */
		optionsLabel?: string;
		choices?: VoiceChoice[];
		/** Why listening stopped or couldn't start; opens the options by itself to say so. */
		notice?: string;
		/** A line under the choices on how it works. */
		hint?: string;
		size?: 'sm' | 'md';
		/** Switches listening on or off. */
		ontoggle?: () => void;
		onchoice?: (key: string, on: boolean) => void;
		/** Whether the options are showing. */
		open?: boolean;
		/** More for the options' panel, under the choices (a table's usage list). */
		children?: Snippet;
	}

	let { status = 'off', level = 0, label, optionsLabel = 'Voice options', choices = [], notice = '', hint = '', size = 'md', ontoggle, onchoice, open = $bindable(false), children }: Props = $props();

	// A reason listening stopped is shown where the choices are, without being asked for.
	let told = '';
	$effect(() => {
		if (notice && notice !== told) open = true;
		told = notice;
	});
</script>

<!--
	Listening and its choices, wherever speech is taken (a table's voice note, the chat's dictation):
	a microphone that is on or off, and beside it what happens to the words, out of the way until
	asked for.
-->
<span class="voice-menu voice-menu--{size}">
	<MicButton {status} {level} {label} {size} onclick={ontoggle} />
	<Popover label={optionsLabel} hideTitle={false} align="end" bind:open triggerClass="voice-options" panelClass="voice-panel">
		{#snippet trigger()}<MenuChevron split={false} />{/snippet}
		{#if choices.length}
			<div class="choices">
				{#each choices as choice (choice.key)}
					<Switch checked={choice.checked} onCheckedChange={(on: boolean) => onchoice?.(choice.key, on)}>
						<span class="choice">{choice.label}{#if choice.detail}<small>{choice.detail}</small>{/if}</span>
					</Switch>
				{/each}
			</div>
		{/if}
		{@render children?.()}
		{#if notice}<Notice tone="info">{notice}</Notice>{/if}
		{#if hint}<p class="hint">{hint}</p>{/if}
	</Popover>
</span>

<style>
	.voice-menu {
		display: inline-flex;
		flex: none;
		align-items: center;
	}

	.voice-menu :global(.voice-options) {
		height: 2.25rem;
		padding: 0 var(--space-1);
	}

	.voice-menu--sm :global(.voice-options) {
		height: 2rem;
		padding: 0 2px;
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

	:global(.voice-panel .notice) {
		margin: var(--space-2);
	}
</style>
