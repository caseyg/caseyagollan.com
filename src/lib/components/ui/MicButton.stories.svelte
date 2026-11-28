<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MicButton from './MicButton.svelte';

	const { Story } = defineMeta({ title: 'Primitives/MicButton', component: MicButton, tags: ['!autodocs'], args: { label: 'Dictate' } });
</script>

<script lang="ts">
	let status = $state<'off' | 'listening'>('off');
</script>

<!-- Press it to switch listening on and off. -->
<Story asChild name="Off">
	<MicButton {status} level={0.4} label={status === 'off' ? 'Dictate' : 'Stop dictating'} onclick={() => (status = status === 'off' ? 'listening' : 'off')} />
</Story>

<!-- Waiting for the microphone and the speech model. -->
<Story name="Starting" args={{ status: 'starting' }} />

<!-- Listening: the site's blue, and a ring that follows how loud the microphone is. -->
<Story name="Listening" args={{ status: 'listening', level: 0.7, label: 'Stop dictating' }} />

<Story name="Listening, quiet" args={{ status: 'listening', level: 0.05, label: 'Stop dictating' }} />

<!-- The size that sits in a compact composer. -->
<Story name="Small" args={{ size: 'sm', status: 'listening', level: 0.4 }} />
