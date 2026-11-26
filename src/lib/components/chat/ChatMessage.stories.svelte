<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatMessage from './ChatMessage.svelte';
	import { answer, draft, failed, question, streaming, tableAnswer, working } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatMessage', component: ChatMessage, args: { message: question } });
</script>

<!-- A visitor's message: their name links to their profile, with how they signed in. -->
<Story name="Person" />

<Story name="Own message" args={{ own: true }} />

<!-- The agent's steps sit in gray where it took them, between the text before and after, summed up in a line that opens. -->
<Story name="Assistant with steps" args={{ message: answer }} />

<!-- A step under way after some text: its line says what it is doing, and the writing dots wait. -->
<Story name="Working on a step" args={{ message: working }} />

<!-- Older replies don't say where their steps happened: they come first, as before. -->
<Story name="Table work, compact" args={{ message: tableAnswer, compact: true }} />

<!-- Still writing: unfinished Markdown is closed (remend) so it renders cleanly. -->
<Story name="Streaming" args={{ message: streaming }} />

<Story name="Failed" args={{ message: failed }} />

<!-- Only when Casey asked: a Micropub step, with no contents shown. -->
<Story name="Saved a draft (owner)" args={{ message: draft }} />

<!-- A message that invoked a skill: the slash command reads as a chip, then what was asked. -->
<Story name="Invoked a skill" args={{ own: true, message: { ...question, content: '/link-roundup for this week, leaving out the likes', skill: 'link-roundup' } }} />
