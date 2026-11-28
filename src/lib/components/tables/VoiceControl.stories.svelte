<script module lang="ts">
	import { setContext } from 'svelte';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Toolbar } from '@ui-sdk/svelte/toolbar';
	import VoiceControl, { type VoiceView } from './VoiceControl.svelte';

	const { Story } = defineMeta({ title: 'Tables/VoiceControl', component: VoiceControl, tags: ['!autodocs'] });
	const off: VoiceView = { status: 'off', correct: true, arrange: false, commands: true };
</script>

<script lang="ts">
	// As in the table toolbar, where its buttons share one tab stop.
	setContext('ui:toolbar', true);
	let voice = $state<VoiceView>({ ...off });
	const toggle = () => (voice.status = voice.status === 'off' ? 'listening' : 'off');
</script>

{#snippet control(view: VoiceView, open = false)}
	<div class="stage"><Toolbar aria-label="Table"><VoiceControl voice={view} {open} /></Toolbar></div>
{/snippet}

<!-- Press the microphone to switch listening on and off; the chevron opens the choices. -->
<Story asChild name="Off">
	<div class="stage">
		<Toolbar aria-label="Table"><VoiceControl {voice} ontoggle={toggle} oncorrect={(on) => (voice.correct = on)} onarrange={(on) => (voice.arrange = on)} oncommands={(on) => (voice.commands = on)} /></Toolbar>
	</div>
</Story>

<!-- Waiting for the microphone and the speech model. -->
<Story asChild name="Starting">{@render control({ ...off, status: 'starting' })}</Story>

<!-- Listening: the button turns the site's blue and its ring follows how loud the microphone is. -->
<Story asChild name="Listening">{@render control({ ...off, status: 'listening', level: 0.7 })}</Story>

<!-- What can happen to a finished block, and how blocks combine and split. -->
<Story asChild name="Options">{@render control({ ...off, arrange: true }, true)}</Story>

<!-- A spoken command was carried out: what it did shows over the microphone for a few seconds. -->
<Story asChild name="Command done">{@render control({ ...off, status: 'listening', level: 0.2, did: { text: 'Drew 1 arrow' } })}</Story>

<!-- A model is considering what was just said; the block it is about is drawn faint on the table meanwhile. -->
<Story asChild name="Thinking">{@render control({ ...off, status: 'listening', level: 0.1, thinking: true })}</Story>

<!-- Usage: what each service has been used for and about what it cost; the switch puts the running total by the microphone. -->
<Story asChild name="Usage">
	{@render control({ ...off, status: 'listening', level: 0.3, usage: { shown: true, usd: 0.0508, monthUsd: 1.37, lines: [
		{ service: 'Speech: deepgram/flux on Workers AI', amount: '6.2 min', usd: 0.0477 },
		{ service: 'Text: inference-coop:glm-4.6', amount: '41 asks, 38.2k tokens in, 2.9k out', usd: 0.0031 }
	] } }, true)}
</Story>

<!-- A reason listening stopped opens the options by itself. -->
<Story asChild name="Microphone blocked">{@render control({ ...off, notice: 'The microphone is blocked for this site. Allow it in the browser’s site settings.' })}</Story>

<style>
	.stage { display: flex; justify-content: center; min-height: 34rem; padding-top: var(--space-7); }
	.stage :global([data-slot='toolbar']) { display: flex; align-items: center; height: max-content; }
</style>
