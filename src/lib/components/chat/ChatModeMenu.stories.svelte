<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatModeMenu, { type ChatPlace } from './ChatModeMenu.svelte';

	const { Story } = defineMeta({ title: 'Chat/ChatModeMenu', component: ChatModeMenu, parameters: { docs: { story: { height: '220px' } } }, args: { value: 'sidebar', align: 'start', onchange: () => {} } });
</script>

<script lang="ts">
	let place = $state<ChatPlace>('sidebar');
</script>

<!-- In the chat's header on a wide screen: where the chat sits. The button shows the place in effect. Hidden under 900px, where the chat is a bottom sheet. -->
<Story name="Choosing">
	{#snippet template(args)}
		<ChatModeMenu {...args} value={place} onchange={(next) => (place = next)} />
		<p>The chat is: {place}</p>
	{/snippet}
</Story>

<!-- On the chat's own page the switch shows Full screen. -->
<Story name="Full screen" args={{ value: 'fullscreen' }} />
