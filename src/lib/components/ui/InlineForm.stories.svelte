<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InlineForm from './InlineForm.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/InlineForm',
		component: InlineForm,
		parameters: { docs: { story: { height: '160px' } } },
		args: { label: 'Your Mastodon server', name: 'server', placeholder: 'mastodon.social', buttonLabel: 'Go', onsubmit: (value: string) => console.log(value) }
	});
</script>

<!-- One field and one button on a line. Without JavaScript it sends to `action`; with it, `onsubmit` gets the value. -->
<Story name="Default" />

<Story name="With hint" args={{ hint: 'Opens the post there, signed in.' }} />

<Story name="Error" args={{ value: 'not a server', error: 'Type your server’s address, such as mastodon.social.' }} />

<Story name="Busy" args={{ value: 'https://example.com/reply', label: 'Your post’s address', buttonLabel: 'Send', busyLabel: 'Sending…', busy: true }} />
