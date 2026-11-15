<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Runs when a pull from the top of the page passes `threshold` and is let go. */
		onPull: () => void;
		/** What the pull does, shown on the tab that follows the finger. */
		label?: string;
		/** Shown once letting go will run `onPull`. */
		armedLabel?: string;
		/** How far, in pixels, to pull before letting go runs it. */
		threshold?: number;
		disabled?: boolean;
	}

	let { onPull, label = 'Pull for commands', armedLabel = 'Release for commands', threshold = 72, disabled = false }: Props = $props();

	let pull = $state(0);
	let armed = $state(false);
	let dragging = $state(false);

	// Surfaces with their own touch dragging, such as the graphs, keep their gestures,
	// except in the band at the top of the screen, where a pull always means this.
	const OWN_GESTURES = 'canvas, svg, input, textarea, select, [contenteditable], [data-no-pull], dialog, [role="dialog"]';
	const TOP_BAND = 120;

	onMount(() => {
		let start: { x: number; y: number } | null = null;
		let engaged = false;

		const scrolledToTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
		function scrolledInside(target: Element | null) {
			for (let node = target; node && node !== document.body; node = node.parentElement) {
				if (node.scrollTop > 0) return true;
			}
			return false;
		}

		function onStart(event: TouchEvent) {
			start = null;
			engaged = false;
			if (disabled || event.touches.length !== 1 || !scrolledToTop()) return;
			const touch = event.touches[0];
			const target = event.target instanceof Element ? event.target : null;
			if (touch.clientY > TOP_BAND && (target?.closest(OWN_GESTURES) || scrolledInside(target))) return;
			start = { x: touch.clientX, y: touch.clientY };
		}

		function onMove(event: TouchEvent) {
			if (!start) return;
			const touch = event.touches[0];
			const dy = touch.clientY - start.y;
			const dx = touch.clientX - start.x;
			if (!engaged) {
				// A sideways or upward swipe is someone else's; let it go.
				if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
					if (Math.abs(dx) > 8 || dy < -8) start = null;
					return;
				}
				if (dy > 8) {
					engaged = true;
					dragging = true;
				}
			}
			// Holding the page still also keeps the browser's own pull-to-refresh and bounce from starting.
			if (event.cancelable) event.preventDefault();
			if (!engaged) return;
			// Resist more the further it goes, like an elastic edge.
			const max = threshold * 1.6;
			pull = max * (1 - Math.exp(-dy / max));
			const nowArmed = dy >= threshold;
			if (nowArmed && !armed) navigator.vibrate?.(8);
			armed = nowArmed;
		}

		function onEnd() {
			if (engaged && armed) onPull();
			start = null;
			engaged = false;
			dragging = false;
			armed = false;
			pull = 0;
		}

		// Listen while the event travels down, before a graph's own handlers can stop it.
		const capture = { capture: true };
		window.addEventListener('touchstart', onStart, { ...capture, passive: true });
		window.addEventListener('touchmove', onMove, { ...capture, passive: false });
		window.addEventListener('touchend', onEnd, capture);
		window.addEventListener('touchcancel', onEnd, capture);
		return () => {
			window.removeEventListener('touchstart', onStart, capture);
			window.removeEventListener('touchmove', onMove, capture);
			window.removeEventListener('touchend', onEnd, capture);
			window.removeEventListener('touchcancel', onEnd, capture);
		};
	});
</script>

<!-- A gesture shortcut only: what it opens is reachable another way, so the tab is hidden from assistive technology. -->
<div class="pull-down" class:dragging class:armed style:--pull="{pull}px" aria-hidden="true">
	<span class="tab"><Icon name="search" size={16} />{armed ? armedLabel : label}</span>
</div>

<style>
	.pull-down {
		position: fixed;
		top: 0;
		left: 50%;
		z-index: var(--z-nav);
		pointer-events: none;
		translate: -50% calc(var(--pull, 0px) - 100%);
		opacity: 0;
		transition: translate 250ms var(--ease-out), opacity 150ms var(--ease-out);
	}

	.pull-down.dragging {
		opacity: 1;
		transition: none;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-primary);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		white-space: nowrap;
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.3);
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease), scale var(--duration) var(--ease);
	}

	/* Surfaces are translucent; lay one over the ground so the page doesn't show through. */
	.armed .tab {
		background: linear-gradient(var(--surface-2), var(--surface-2)), var(--bg-primary);
		color: var(--text-primary);
		scale: 1.05;
	}

	@media (prefers-reduced-motion: reduce) {
		.pull-down,
		.tab {
			transition: none;
		}
	}
</style>
