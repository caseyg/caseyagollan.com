<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import ChatOverlay from './ChatOverlay.svelte';
	import { owner, selection, selectionConversation, tableConversation, threads as fixtureThreads, visitor } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatOverlay',
		component: ChatOverlay,
		parameters: { layout: 'fullscreen' },
		args: { title: 'Cooperatives', messages: tableConversation, viewer: owner, tools: ['search_site', 'fetch_page', 'show_page', 'table_read', 'table'], returnTo: '/tables/demo-table', href: '/chat/a1b2c3d4e5' }
	});
</script>

<!-- Over a table's canvas: a round floating button, or the site's side panel, which the canvas makes room for beneath the navigation. On a phone, docked is a bottom sheet. -->
{#snippet stage(args: ComponentProps<typeof ChatOverlay>, mode: 'minimized' | 'docked')}
	<div class="stage" data-chat={mode}>
		<div class="canvas">Canvas</div>
		<ChatOverlay {...args} {mode} launcher="bottom-right" onsend={() => true} />
	</div>
{/snippet}

<Story name="Minimized">{#snippet template(args)}{@render stage(args, 'minimized')}{/snippet}</Story>

<Story name="Docked">{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

<!-- Things are selected on the canvas: the chip above the composer names what “these” will mean (× clears it), and a sent message keeps what was selected. -->
<Story name="With a selection" args={{ messages: selectionConversation, selection }}>{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

<!-- Docked on a phone: a bottom sheet over the canvas. Folded, it keeps the composer and the newest reply's last line, and the canvas ends above it. -->
{#snippet phone(args: ComponentProps<typeof ChatOverlay>, expanded: boolean)}
	<div class="stage" data-chat="sheet">
		<div class="canvas">Canvas</div>
		<div class="sheet-dock">
			<ChatOverlay {...args} mode="docked" sheet sheetExpanded={expanded} onsend={() => true} />
		</div>
	</div>
{/snippet}

<Story name="Docked on a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>{#snippet template(args)}{@render phone(args, true)}{/snippet}</Story>

<Story name="Docked on a phone, folded" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>{#snippet template(args)}{@render phone(args, false)}{/snippet}</Story>

<!-- On any page of the site: Casey's chat follows them around, with All chats and New chat in the title bar. -->
<Story name="On any page" args={{ title: 'New chat', messages: [], onnew: () => {}, onpick: () => {}, onlistthreads: () => {}, threads: fixtureThreads }}>{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

<Story name="Visitor, signed out" args={{ viewer: null, messages: [] }}>{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

<Story name="Visitor, signed in" args={{ viewer: visitor, tools: ['search_site', 'fetch_page', 'show_page', 'table_read'] }}>{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

<style>
	.stage {
		position: relative;
		height: 100vh;
		background: radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 20px 20px;
	}

	.canvas {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--text-muted);
	}

	.stage[data-chat='docked'] .canvas {
		margin-right: calc(var(--chat-dock-width) + 2 * var(--nav-inset));
	}

	.sheet-dock {
		position: absolute;
		inset: auto 0 0;
	}
</style>
