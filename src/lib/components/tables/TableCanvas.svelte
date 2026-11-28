<script module lang="ts">
	/** The type a dragged block carries, as JSON: one `Block` or a list of them. */
	export const BLOCK_DRAG_TYPE = 'application/x-caseyagollan-block';
	/** Dragged with blocks that were found as like something on the table: the ids of what they are linked from once dropped. */
	export const BLOCK_LINK_TYPE = 'application/x-caseyagollan-block-link';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cleanBlock, type Block } from '$lib/tables';
	import { tldrawLicenseKey, tldrawLicensed } from '$lib/tldraw-license';
	import Notice from '../ui/Notice.svelte';
	import TableWireframe from './TableWireframe.svelte';
	import type { TableApi } from './canvas/TableEditor';

	interface Props {
		/** A saved tldraw document, or null for an empty table. */
		document: unknown;
		/** The owner arranges the table; everyone else pans, zooms and opens blocks. */
		editable?: boolean;
		/** Framed in a post: the page keeps the scroll wheel, and dragging pans. */
		embedded?: boolean;
		onchange?: (document: unknown) => void;
		onready?: (api: TableApi) => void;
		/** The canvas was right-clicked (or long-pressed) while editable: where, in the viewport. Whatever was under the pointer is selected by then. */
		onmenu?: (point: { x: number; y: number }) => void;
		class?: string;
	}

	let { document, editable = false, embedded = false, onchange, onready, onmenu, class: className = '' }: Props = $props();

	let host: HTMLDivElement;
	let api: TableApi | undefined;
	let failed = $state(false);
	let unlicensed = $state(false);
	let dropping = $state(false);
	/** The canvas has drawn its blocks; until then the table's wireframe stands in, and the canvas fades in over it. */
	let ready = $state(false);

	const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

	/** Waits for tldraw to draw the blocks and for the pictures in view to decode, but not long. */
	async function reveal() {
		await frame();
		await frame();
		const pictures = Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => {}));
		await Promise.race([Promise.all(pictures), new Promise((resolve) => setTimeout(resolve, 500))]);
		ready = true;
	}

	onMount(() => {
		unlicensed = !tldrawLicensed(location.hostname);
		let root: import('react-dom/client').Root | undefined;
		let cancelled = false;
		// React and tldraw load with the table page only, and never on the server.
		Promise.all([import('react'), import('react-dom/client'), import('./canvas/TableEditor')])
			.then(([React, { createRoot }, { TableEditor }]) => {
				if (cancelled) return;
				root = createRoot(host);
				root.render(
					React.createElement(TableEditor, {
						// tldraw freezes what it is given, which a Svelte state proxy refuses.
						document: $state.snapshot(document),
						editable,
						embedded,
						licenseKey: tldrawLicenseKey(location.hostname),
						onChange: (next: unknown) => onchange?.(next),
						onReady: (ready: TableApi) => {
							api = ready;
							onready?.(ready);
							void reveal();
						}
					})
				);
			})
			.catch((error) => {
				console.error('Table canvas failed to load:', error);
				failed = true;
			});
		return () => {
			cancelled = true;
			root?.unmount();
		};
	});

	// The site's menu stands in for the browser's, except where text is being typed (spelling, paste).
	function oncontextmenu(event: MouseEvent) {
		if (!editable || !onmenu || (event.target as HTMLElement | null)?.closest('[contenteditable="true"], input, textarea')) return;
		event.preventDefault();
		const point = { x: event.clientX, y: event.clientY };
		// tldraw selects what was right-clicked on the same press; the menu reads the selection after that.
		setTimeout(() => onmenu(point));
	}

	const carriesBlocks = (event: DragEvent) => !!event.dataTransfer?.types.includes(BLOCK_DRAG_TYPE);

	function ondragover(event: DragEvent) {
		if (!editable || !carriesBlocks(event)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dropping = true;
	}

	// Blocks dragged in from the picker land where they are dropped; tldraw handles files and links itself.
	function ondrop(event: DragEvent) {
		dropping = false;
		if (!editable || !carriesBlocks(event) || !api) return;
		event.preventDefault();
		event.stopPropagation();
		let parsed: unknown;
		try {
			parsed = JSON.parse(event.dataTransfer!.getData(BLOCK_DRAG_TYPE));
		} catch {
			return;
		}
		const blocks = [parsed].flat().map(cleanBlock).filter((block): block is Block => block !== null);
		// Several dragged over together are set out in rows, in the order they were listed.
		let linkFrom: string[] | undefined;
		try {
			const ids: unknown = JSON.parse(event.dataTransfer!.getData(BLOCK_LINK_TYPE) || '[]');
			if (Array.isArray(ids)) linkFrom = ids.filter((id): id is string => typeof id === 'string').slice(0, 50);
		} catch {
			// Dropped without links.
		}
		api.addBlocks(blocks, { x: event.clientX, y: event.clientY }, { columns: Math.min(blocks.length, 4), ...(linkFrom?.length ? { linkFrom } : {}) });
	}
</script>

<div
	class="table-canvas {className}"
	class:dropping
	class:readonly={!editable}
	ondragovercapture={ondragover}
	ondragleave={() => (dropping = false)}
	ondropcapture={ondrop}
	{oncontextmenu}
	role="application"
	aria-label={editable ? 'Table canvas. Double-click a block to open it.' : 'Table. Double-click a block to open it.'}
>
	{#if !ready && !failed}
		<div class="standin" out:fade={{ duration: 150 }}><TableWireframe {document} /></div>
	{/if}
	<div class="host" class:ready bind:this={host}></div>
	{#if failed || unlicensed}
		<div class="message">
			<Notice tone={failed ? 'error' : 'info'}>
				{#if failed}
					The table couldn’t load. Reload the page to try again.
				{:else}
					Tables draw with tldraw, whose licence here covers caseyagollan.com. On this host the canvas only shows for a few seconds.
				{/if}
			</Notice>
		</div>
	{/if}
</div>

<style>
	.table-canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-primary);
	}

	.host {
		position: absolute;
		inset: 0;
		opacity: 0;
	}

	.standin {
		position: absolute;
		inset: 0;
	}

	.host.ready {
		opacity: 1;
		transition: opacity var(--duration) ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.host.ready {
			transition: none;
		}
	}

	.dropping::after {
		content: '';
		position: absolute;
		inset: var(--space-2);
		border: 2px dashed var(--text-primary);
		border-radius: var(--radius-md);
		pointer-events: none;
	}

	.message {
		position: absolute;
		left: 50%;
		bottom: calc(var(--space-7) + var(--space-6));
		translate: -50% 0;
		width: min(28rem, calc(100% - 2 * var(--space-4)));
		pointer-events: none;
	}

	.message :global(.notice) {
		background: var(--surface-sunken);
	}

	/* tldraw in the site's colours: gray ground, white ink, blue selection, Dagny type. */
	.table-canvas :global(.tl-container),
	.table-canvas :global(.tl-theme__dark) {
		--tl-color-background: var(--bg-primary);
		--tl-color-selection-stroke: var(--accent);
		--tl-color-selection-fill: rgb(0 0 255 / 0.12);
		--tl-color-text: var(--text-primary);
		--tl-color-text-1: var(--text-primary);
		/* The dot grid blocks snap to: quiet, so it reads as paper, not content. */
		--tl-color-grid: var(--border-strong);
		--tl-font-sans: var(--font-sans);
		font-family: var(--font-sans);
	}

	/* An area (a tldraw frame) is a lighter patch of the ground, not tldraw's near-black panel. */
	.table-canvas :global(.tl-frame__body:not(.tl-frame__creating)) {
		fill: var(--surface-3);
		stroke: var(--border-strong);
	}

	/* Its name tag matches. tldraw colours the tag inline, so these have to outrank that. */
	.table-canvas :global(.tl-frame-heading-hit-area) {
		background-color: var(--surface-3) !important;
		box-shadow: none !important;
		color: var(--text-primary) !important;
	}

	.table-canvas :global(.site-block) {
		width: 100%;
		height: 100%;
	}

	/* Blocks open with a double-click, so they look like it when the table can't be changed. */
	.readonly :global(.site-block) {
		cursor: pointer;
	}
</style>
