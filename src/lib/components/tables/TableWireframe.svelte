<script lang="ts">
	import { tableWireframe } from '$lib/table-wireframe';

	interface Props {
		/** A saved tldraw document. Nothing is drawn for an empty table. */
		document: unknown;
		class?: string;
	}

	let { document, class: className = '' }: Props = $props();

	// Drawn from the document itself, so it shows with the page's first paint, before tldraw loads.
	const picture = $derived.by(() => {
		const svg = tableWireframe(document, { tight: true });
		return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
	});
</script>

<!--
	A table's blocks and arrows as plain boxes, where the canvas will put them: tldraw zooms a table to
	fit inside 64px of its frame (less on narrow screens), and so does this.
-->
{#if picture}
	<div class="table-wireframe {className}" aria-hidden="true">
		<img src={picture} alt="" draggable="false" />
	</div>
{/if}

<style>
	.table-wireframe {
		position: absolute;
		inset: 0;
		box-sizing: border-box;
		/* tldraw's zoom-to-fit leaves min(128px, 28% of the width) around a table, half on each side. */
		padding: min(64px, 14%);
		pointer-events: none;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
