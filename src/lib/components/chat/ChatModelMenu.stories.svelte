<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { CHAT_PROVIDERS, modelKey, modelOptions, type ChatModelChoices } from '$lib/chat-models';
	import ChatModelMenu from './ChatModelMenu.svelte';

	const all = modelOptions(CHAT_PROVIDERS);
	const two = modelOptions(CHAT_PROVIDERS.filter((provider) => provider.id !== 'cerebras'));
	const flash = modelKey('inference-coop', 'glm-flash-green');
	const models: ChatModelChoices = { models: all, current: flash };

	const { Story } = defineMeta({ title: 'Chat/ChatModelMenu', component: ChatModelMenu, parameters: { docs: { story: { height: '460px' } } }, args: { models, align: 'start', side: 'bottom', onchange: () => {} } });
</script>

<script lang="ts">
	let current = $state(flash);
</script>

<!-- In the composer of Casey's own chats: the model answering this chat. Choosing another takes effect from the next answer. -->
<Story name="Choosing">
	{#snippet template(args)}
		<ChatModelMenu {...args} models={{ models: all, current }} onchange={(next) => (current = next)} />
	{/snippet}
</Story>

<!-- A provider is listed only where its key is set: here inference.coop and Anthropic. -->
<Story name="Two providers" args={{ models: { models: two, current: modelKey('anthropic', 'claude-sonnet-5-5') } }} />

<!-- A long name is cut short so the box keeps its room. -->
<Story name="Long name" args={{ models: { models: all, current: modelKey('anthropic', 'claude-sonnet-5-5') } }} />
