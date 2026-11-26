<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatSteps from './ChatSteps.svelte';
	import { answer, tableAnswer, working } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatSteps', component: ChatSteps, args: { steps: answer.tools ?? [], open: false } });
</script>

<!-- Closed once the answer is done: one line for everything it did. -->
<Story name="Summary" />

<!-- Open: each step in a row. A row opens to its details. -->
<Story name="Steps listed" args={{ open: true }} />

<!-- While a step is under way, the line says which. -->
<Story name="Working" args={{ steps: working.tools ?? [] }} />

<!-- One step alone needs no list: its line opens straight to its details. -->
<Story name="One step" args={{ steps: (answer.tools ?? []).slice(0, 1) }} />

<!-- Many kinds, one that failed, a picture, and a page the assistant showed (its card stays in view). -->
<Story name="Table work" args={{ steps: tableAnswer.tools ?? [], open: true }} />

<Story name="Table work on a phone" args={{ steps: tableAnswer.tools ?? [], open: true }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
