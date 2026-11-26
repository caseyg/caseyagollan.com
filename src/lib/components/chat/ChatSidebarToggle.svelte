<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { useChatSidebar } from './sidebar.svelte';

	interface Props {
		/** The sidebar's element id, for `aria-controls`. */
		controls?: string;
	}

	let { controls = 'chat-sidebar' }: Props = $props();
	const sidebar = useChatSidebar();
</script>

<!-- Shows or hides the chat list; pinned beside the trail by each /chat page. Absent outside a ChatLayout. -->
{#if sidebar}
	<span class="chat-sidebar-toggle" data-sidebar={sidebar.state}>
		<Button variant="icon" size="sm" icon="sidebar" label={sidebar.state === 'auto' ? 'Show or hide chats' : sidebar.state === 'open' ? 'Hide chats' : 'Show chats'} pressed={sidebar.state === 'auto' ? undefined : sidebar.state === 'open'} aria-controls={controls} onclick={() => sidebar.toggle()} />
	</span>
{/if}

<style>
	.chat-sidebar-toggle {
		display: inline-flex;
	}
</style>
