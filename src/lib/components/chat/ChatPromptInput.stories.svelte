<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import { owner, visitor } from './fixtures';

	const send = (text: string) => { console.log('Would send', text); return true; };
	const { Story } = defineMeta({ title: 'Chat/ChatPromptInput', component: ChatPromptInput, args: { viewer: visitor, onsend: send, tools: ['search_site', 'fetch_page'] } });
</script>

<!-- One quiet line until focused (progressive disclosure, like the post composer). -->
<Story name="Closed" />

<Story name="Open" args={{ open: true, value: 'Which books about cooperatives are in the library?' }} />

<!-- Casey's own session: Micropub is listed, and there's no chat sign-out. -->
<Story name="Owner" args={{ viewer: owner, open: true, tools: ['search_site', 'fetch_page', 'micropub'] }} />

<Story name="Too long" args={{ open: true, value: 'x'.repeat(4100) }} />

<Story name="Phone" args={{ open: true }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
