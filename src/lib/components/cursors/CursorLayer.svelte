<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Cursor } from '$lib/cursors';
	import CursorPointer from './CursorPointer.svelte';

	interface Props {
		/** Everyone else on the page, by connection. */
		cursors: Record<string, Cursor>;
		/** The viewport's width, which turns a cursor's `x` share back into pixels. */
		width: number;
		/** How far the page is scrolled, since cursors are placed in page pixels. */
		scrollY?: number;
		/** Your own bubble: where your pointer is, in viewport pixels, your color, and what you said. */
		self?: { x: number; y: number; color: string; message?: string };
		/** Your chat field, shown in your bubble while you're typing. */
		selfField?: Snippet;
		/** Moves cursors without easing, as in stories and screenshots. */
		still?: boolean;
	}

	let { cursors, width, scrollY = 0, self, selfField, still = false }: Props = $props();

	/** Room a bubble needs beside and below its pointer before it flips to the other side. */
	const ROOM_X = 240;
	const ROOM_Y = 64;
	let height = $state(0);

	const shown = $derived(Object.entries(cursors).filter(([, cursor]) => cursor.position));
</script>

<!--
	Other visitors' pointers, over everything on the page and never in the way of it: the layer
	ignores the mouse, and pointers off screen are clipped rather than growing the page.
-->
<div class="cursor-layer" class:still bind:clientHeight={height}>
	<div class="page" style:transform="translateY({-scrollY}px)">
		{#each shown as [id, cursor] (id)}
			<div class="placed" style:transform="translate({(cursor.position?.x ?? 0) * width}px, {cursor.position?.y ?? 0}px)">
				<CursorPointer
					color={cursor.color}
					country={cursor.country}
					message={cursor.message}
					flipX={(cursor.position?.x ?? 0) * width > width - ROOM_X}
					flipY={height > 0 && (cursor.position?.y ?? 0) - scrollY > height - ROOM_Y}
				/>
			</div>
		{/each}
	</div>
	{#if self && (selfField || self.message)}
		<div class="placed placed--self" style:transform="translate({self.x}px, {self.y}px)">
			<CursorPointer
				color={self.color}
				field={selfField}
				message={self.message}
				bubbleOnly
				flipX={self.x > width - ROOM_X}
				flipY={height > 0 && self.y > height - ROOM_Y}
			/>
		</div>
	{/if}
</div>

<style>
	.cursor-layer {
		position: fixed;
		inset: 0;
		z-index: calc(var(--z-nav) + 1);
		overflow: hidden;
		pointer-events: none;
	}

	.page,
	.placed {
		position: absolute;
		top: 0;
		left: 0;
	}

	.placed {
		transition: transform 90ms linear;
		will-change: transform;
	}

	.placed--self {
		transition: none;
		pointer-events: auto;
	}

	.still .placed {
		transition: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.placed {
			transition: none;
		}
	}
</style>
