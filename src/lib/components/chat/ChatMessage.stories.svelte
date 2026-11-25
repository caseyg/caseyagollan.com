<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatMessage from './ChatMessage.svelte';
	import { answer, draft, failed, question, streaming } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatMessage', component: ChatMessage, args: { message: question } });
</script>

<!-- A visitor's message: their name links to their profile, with how they signed in. -->
<Story name="Person" />

<Story name="Own message" args={{ own: true }} />

<!-- The agent's steps sit in gray above its answer; steps with links open to show them. -->
<Story name="Assistant with steps" args={{ message: answer }} />

<!-- Still writing: unfinished Markdown is closed (remend) so it renders cleanly. -->
<Story name="Streaming" args={{ message: streaming }} />

<Story name="Failed" args={{ message: failed }} />

<!-- Only when Casey asked: a Micropub step, with no contents shown. -->
<Story name="Saved a draft (owner)" args={{ message: draft }} />
