<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Accessible name for the sheet. */
		label: string;
		/** Pulled up to show its header and body, or folded down to the peek and footer. */
		expanded?: boolean;
		/** Name of the grip while folded, such as “Show the whole chat”. */
		expandLabel?: string;
		/** Name of the grip while open. */
		collapseLabel?: string;
		/** Top of the open sheet, such as a title and its controls. */
		header?: Snippet;
		/** Shown only while folded: a line or two summing up what's above. Pressing it opens the sheet. */
		peek?: Snippet;
		/** Always shown at the bottom, such as a composer. */
		footer?: Snippet;
		/** The scrolling body. It stays mounted and keeps its size while folded, so its scroll position is kept. */
		children?: Snippet;
		/** How tall the open body is, as a CSS length. */
		bodyHeight?: string;
		/** The folded sheet's height in pixels, for the page to leave room for it. */
		restHeight?: number;
		class?: string;
	}

	let {
		label,
		expanded = $bindable(true),
		expandLabel = 'Open the sheet',
		collapseLabel = 'Fold the sheet down',
		header,
		peek,
		footer,
		children,
		bodyHeight = 'min(30rem, 55dvh)',
		restHeight = $bindable(0),
		class: className = ''
	}: Props = $props();

	let sheet = $state<HTMLElement>();
	let inner = $state<HTMLElement>();
	let scroller = $state<HTMLElement>();
	let open = $state<HTMLElement>();
	let peekClip = $state<HTMLElement>();
	let peekButton = $state<HTMLElement>();

	/** Height of the open part while a finger drags the grip; null when it rests. */
	let dragHeight = $state<number | null>(null);
	let drag: { y: number; from: number; full: number; moved: boolean; t: number; v: number } | null = null;
	let swallowClick = false;

	// Whether the reader was at the end of the body when it folded, so it opens at the newest again.
	let pinned = true;
	let wasExpanded = expanded;
	$effect.pre(() => {
		if (expanded === wasExpanded || !scroller) return;
		if (!expanded) pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8;
		wasExpanded = expanded;
	});
	$effect(() => {
		if (expanded && pinned && scroller) scroller.scrollTop = scroller.scrollHeight;
	});

	$effect(() => {
		if (!sheet || typeof ResizeObserver === 'undefined') return;
		// What the sheet measures folded, worked out in any state so the page can leave room for it from the start.
		const measure = () => {
			if (!sheet) return;
			const folded = sheet.offsetHeight - (open?.offsetHeight ?? 0) - (peekClip?.offsetHeight ?? 0) + (peekButton?.offsetHeight ?? 0);
			if (folded > 0) restHeight = folded;
		};
		const observer = new ResizeObserver(measure);
		for (const element of [sheet, open, peekClip, peekButton]) if (element) observer.observe(element);
		return () => observer.disconnect();
	});

	const openHeight = $derived(dragHeight !== null ? `${dragHeight}px` : expanded ? bodyHeight : '0px');

	function pointerdown(event: PointerEvent) {
		if (event.button !== 0 || !inner) return;
		const full = inner.offsetHeight;
		drag = { y: event.clientY, from: expanded ? full : 0, full, moved: false, t: event.timeStamp, v: 0 };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function pointermove(event: PointerEvent) {
		if (!drag) return;
		const dy = event.clientY - drag.y;
		if (!drag.moved && Math.abs(dy) < 6) return;
		drag.moved = true;
		const next = Math.min(drag.full, Math.max(0, drag.from - dy));
		const dt = Math.max(1, event.timeStamp - drag.t);
		drag.v = ((dragHeight ?? drag.from) - next) / dt;
		drag.t = event.timeStamp;
		dragHeight = next;
	}

	function pointerup() {
		if (!drag) return;
		if (drag.moved && dragHeight !== null) {
			// A flick decides on its own; a slow drag settles toward the nearer end.
			expanded = Math.abs(drag.v) > 0.5 ? drag.v < 0 : dragHeight > drag.full / 2;
			swallowClick = true;
		}
		drag = null;
		dragHeight = null;
	}

	function toggle() {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		expanded = !expanded;
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp' && !expanded) expanded = true;
		else if (event.key === 'ArrowDown' && expanded) expanded = false;
		else return;
		event.preventDefault();
	}
</script>

<!--
	A sheet along the bottom of the screen that folds down to a summary and its footer, leaving the page
	above it usable, and pulls up to show the rest. Drag or press the grip; the arrow keys work on it too.
	The body keeps its scroll position while folded, and the page can leave room for the folded sheet with
	`restHeight`, so neither loses its place.
-->
<section bind:this={sheet} class="bottom-sheet {className}" class:expanded class:dragging={dragHeight !== null} aria-label={label}>
	<button
		type="button"
		class="grip"
		aria-expanded={expanded}
		aria-label={expanded ? collapseLabel : expandLabel}
		onpointerdown={pointerdown}
		onpointermove={pointermove}
		onpointerup={pointerup}
		onpointercancel={pointerup}
		onclick={toggle}
		onkeydown={keydown}
	>
		<span class="bar" aria-hidden="true"></span>
	</button>
	<div bind:this={open} class="open" style:height={openHeight} inert={!expanded && dragHeight === null}>
		<div bind:this={inner} class="inner" style:height={bodyHeight}>
			{#if header}<header>{@render header()}</header>{/if}
			<div bind:this={scroller} class="body">{@render children?.()}</div>
		</div>
	</div>
	{#if peek}
		<div bind:this={peekClip} class="peek-clip" inert={expanded}>
			<button bind:this={peekButton} type="button" class="peek" onclick={() => (expanded = true)} aria-label={expandLabel}>{@render peek()}</button>
		</div>
	{/if}
	{#if footer}<footer>{@render footer()}</footer>{/if}
</section>

<style>
	.bottom-sheet {
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - var(--nav-lane, 0px));
		padding-bottom: env(safe-area-inset-bottom);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: var(--bg-primary);
		box-shadow: 0 -6px 24px rgb(0 0 0 / 0.14);
		color: var(--text-primary);
	}

	.grip {
		display: flex;
		justify-content: center;
		flex-shrink: 0;
		width: 100%;
		padding: var(--space-2) 0 var(--space-1);
		border: 0;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: none;
		cursor: grab;
		touch-action: none;
	}

	.dragging .grip {
		cursor: grabbing;
	}

	.bar {
		width: 2.25rem;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--border-strong);
		transition: background var(--duration) var(--ease);
	}

	.grip:hover .bar,
	.grip:focus-visible .bar {
		background: var(--text-muted);
	}

	.grip:focus-visible {
		outline: var(--focus-ring);
		outline-offset: -2px;
	}

	/* Clips the body instead of shrinking it, so the body's scroll position survives folding. */
	.open {
		flex-shrink: 1;
		min-height: 0;
		overflow: hidden;
		transition: height 260ms var(--ease);
	}

	.dragging .open {
		transition: none;
	}

	.inner {
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - var(--nav-lane, 0px) - 10rem);
	}

	header {
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.peek-clip {
		flex-shrink: 0;
		interpolate-size: allow-keywords;
		overflow: hidden;
		transition: height 260ms var(--ease);
	}

	.expanded .peek-clip {
		height: 0;
	}

	.peek {
		display: block;
		width: 100%;
		padding: 0 var(--space-4) var(--space-2);
		border: 0;
		background: none;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}

	footer {
		flex-shrink: 0;
	}

	.expanded footer {
		border-top: 1px solid var(--border);
	}

	@media (prefers-reduced-motion: reduce) {
		.open,
		.peek-clip {
			transition: none;
		}
	}
</style>
