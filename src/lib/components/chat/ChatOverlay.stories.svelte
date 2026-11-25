<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import ChatOverlay from './ChatOverlay.svelte';
	import { owner, tableConversation, visitor } from './fixtures';

	const { Story } = defineMeta({
		title: 'Chat/ChatOverlay',
		component: ChatOverlay,
		parameters: { layout: 'fullscreen' },
		args: { title: 'Cooperatives', messages: tableConversation, viewer: owner, tools: ['search_site', 'fetch_page', 'show_page', 'table_read', 'table'], returnTo: '/tables/demo-table', href: '/chat/a1b2c3d4e5' }
	});
</script>

<!-- Over a table's canvas: a pill, a floating panel, or a sidebar the canvas makes room for. On a phone, docked is a bottom sheet. -->
{#snippet stage(args: ComponentProps<typeof ChatOverlay>, mode: 'minimized' | 'floating' | 'docked')}
	<div class="stage" data-chat={mode}>
		<div class="canvas">Canvas</div>
		<div class="dock">
			<ChatOverlay {...args} {mode} onsend={() => true} />
		</div>
	</div>
{/snippet}

<Story name="Minimized">{#snippet template(args)}{@render stage(args, 'minimized')}{/snippet}</Story>

<Story name="Floating">{#snippet template(args)}{@render stage(args, 'floating')}{/snippet}</Story>

<Story name="Docked">{#snippet template(args)}{@render stage(args, 'docked')}{/snippet}</Story>

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

<Story name="Visitor, signed out" args={{ viewer: null, messages: [] }}>{#snippet template(args)}{@render stage(args, 'floating')}{/snippet}</Story>

<Story name="Visitor, signed in" args={{ viewer: visitor, tools: ['search_site', 'fetch_page', 'show_page', 'table_read'] }}>{#snippet template(args)}{@render stage(args, 'floating')}{/snippet}</Story>

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
		margin-right: 24rem;
	}

	.dock {
		position: absolute;
		left: var(--space-4);
		bottom: var(--space-4);
	}

	.sheet-dock {
		position: absolute;
		inset: auto 0 0;
	}

	.stage[data-chat='docked'] .dock {
		inset: 0 0 0 auto;
		width: 24rem;
	}
</style>
