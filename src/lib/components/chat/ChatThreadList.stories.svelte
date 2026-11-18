<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatThreadList from './ChatThreadList.svelte';
	import { threads } from './fixtures';

	const { Story } = defineMeta({ title: 'Chat/ChatThreadList', component: ChatThreadList, args: { threads, now: threads[0].updatedAt + 300_000 } });
</script>

<Story name="Threads" />

<Story name="Empty" args={{ threads: [] }} />
