<script lang="ts">
	import type { PageData } from './$types';
	import { TableCanvas } from '$lib/components/tables';
	import { Button, Notice } from '$lib/components/ui';

	let { data }: { data: PageData } = $props();

	const href = $derived(`/tables/${data.id}/`);

	// Scrolling over the table scrolls the post, as a picture would. tldraw would take the wheel for
	// itself, so it never hears it; pinching (a wheel with ctrl) still zooms.
	function onwheel(event: WheelEvent) {
		if (!event.ctrlKey) event.stopPropagation();
	}
</script>

<svelte:head>
	<title>{data.table ? `${data.table.name} - ` : ''}Tables - Casey Gollan</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window onwheelcapture={onwheel} />

<!-- A table inside a post: read-only, drag to pan, pinch to zoom, double-click a block to open it. -->
<main class="frame">
	{#if data.table}
		<TableCanvas document={data.table.document} embedded />
		<div class="open"><Button {href} variant="secondary" size="sm" target="_top" title="Open the whole table">{data.table.name} ↗</Button></div>
	{:else}
		<div class="missing"><Notice>This table isn’t published.</Notice></div>
	{/if}
</main>

<style>
	.frame {
		position: fixed;
		inset: 0;
		font-size: var(--fs-base);
	}

	/* The way out to the whole table, in the corner tldraw's watermark leaves free. */
	.open {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: var(--z-sticky);
	}

	.missing {
		display: grid;
		place-items: center;
		height: 100%;
		padding: var(--space-4);
	}
</style>
