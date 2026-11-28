<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VoiceMenu, { type VoiceChoice } from './VoiceMenu.svelte';

	const choices: VoiceChoice[] = [
		{ key: 'correct', label: 'Correct the text', detail: 'After each pause, a model fixes misheard words and punctuation.', checked: true },
		{ key: 'send', label: 'Send when I pause', detail: 'Each pause sends the message. Off, the words wait in the box.', checked: false }
	];
	const { Story } = defineMeta({ title: 'Primitives/VoiceMenu', component: VoiceMenu, tags: ['!autodocs'], args: { label: 'Dictate', choices } });
</script>

<script lang="ts">
	let status = $state<'off' | 'listening'>('off');
	let mine = $state(choices.map((choice) => ({ ...choice })));
</script>

{#snippet stage(args: Record<string, unknown>)}
	<div class="stage"><VoiceMenu label="Dictate" {choices} {...args} /></div>
{/snippet}

<!-- Press the microphone to switch listening on and off; the chevron opens the choices. -->
<Story asChild name="Off">
	<div class="stage">
		<VoiceMenu {status} level={0.4} label={status === 'off' ? 'Dictate' : 'Stop dictating'} choices={mine} ontoggle={() => (status = status === 'off' ? 'listening' : 'off')} onchoice={(key, on) => (mine = mine.map((choice) => (choice.key === key ? { ...choice, checked: on } : choice)))} />
	</div>
</Story>

<Story asChild name="Listening">{@render stage({ status: 'listening', level: 0.7, label: 'Stop dictating' })}</Story>

<!-- What happens to the words, each with a sentence on what it does. -->
<Story asChild name="Options">{@render stage({ open: true, hint: 'Words go after whatever the box already holds.' })}</Story>

<!-- A reason listening stopped opens the options by itself. -->
<Story asChild name="Microphone blocked">{@render stage({ notice: 'The microphone is blocked for this site. Allow it in the browser’s site settings.' })}</Story>

<!-- The size that sits in a compact composer. -->
<Story asChild name="Small">{@render stage({ size: 'sm' })}</Story>

<style>
	.stage { display: flex; justify-content: center; min-height: 20rem; padding-top: var(--space-7); }
</style>
