<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { ChatLayout } from '$lib/components/chat';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<ChatLayout threads={data.threads} currentId={page.params.id} searchable={!!page.data.viewer?.owner}>
	<!-- A thread page holds one live connection, so moving to another thread makes a fresh page. -->
	{#key page.params.id}{@render children()}{/key}
</ChatLayout>
