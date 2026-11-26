<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FloatingButton from './FloatingButton.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/FloatingButton',
		component: FloatingButton,
		parameters: { layout: 'fullscreen', docs: { story: { height: '320px', inline: false } } },
		args: { icon: 'chat', label: 'Open the chat' }
	});
</script>

<!--
	The round buttons that float over the page's corners: sound at bottom left, chat at bottom right.
	The same size, outline and icon weight, and the same distance from the edges as the navigation.
-->
<Story name="In place" />

<Story name="Busy" args={{ busy: true, busyLabel: 'writing' }} />

<Story name="Pressed" args={{ icon: 'volume', label: 'Turn sound off', pressed: true }} />

<!-- As on the homepage and in the library: sound in one corner, chat in the other. -->
<Story name="Both corners">
	{#snippet template()}
		<div class="page">The page behind the buttons</div>
		<FloatingButton corner="bottom-left" icon="volume" label="Turn sound off" />
		<FloatingButton corner="bottom-right" icon="chat" label="Open the chat" />
	{/snippet}
</Story>

<!-- On a table the bottom belongs to the canvas, so the chat waits under the navigation. -->
<Story name="Under the navigation">
	{#snippet template()}
		<div class="page">The page behind the button</div>
		<FloatingButton corner="top-right" icon="chat" label="Open the chat" busy />
	{/snippet}
</Story>

<Story name="Both corners on a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	{#snippet template()}
		<div class="page">The page behind the buttons</div>
		<FloatingButton corner="bottom-left" icon="volume-off" label="Turn sound on" />
		<FloatingButton corner="bottom-right" icon="chat" label="Open the chat" />
	{/snippet}
</Story>

<style>
	.page {
		display: grid;
		place-items: center;
		min-height: 100vh;
		color: var(--text-muted);
	}
</style>
