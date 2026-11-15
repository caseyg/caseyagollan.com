<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `start` is the top-left corner, for where you are; `end` is the top-right, for where you can go. */
		side?: 'start' | 'end';
		/** On a phone: stay `pinned`, drop back `inline` into the page, or be `hidden`. */
		phone?: 'pinned' | 'inline' | 'hidden';
		as?: 'div' | 'nav';
		class?: string;
		children: Snippet;
		/**
		 * At the `end` side: set when the corner's contents, at full width, would not leave the
		 * `start` corner room for its title. The caller then shows a condensed version.
		 */
		crowded?: boolean;
		[key: string]: unknown;
	}

	let { side = 'start', phone = 'pinned', as = 'div', class: className = '', children, crowded = $bindable(false), ...rest }: Props = $props();

	/** The narrowest gap between the two corners that still holds a date pill with room to breathe. */
	const DATE_ROOM = 128;
	/** How much of a trail's titles stays readable before the other corner condenses: a word or two. */
	const TITLE_ROOM = 96;
	/** Corners tell each other when they change size, so the `end` one can decide whether it fits. */
	const EVENT = 'corner-resize';

	/*
	 * The room the `start` corner asks for: its full width, less what its titles give up when they
	 * end in an ellipsis, keeping `TITLE_ROOM` of them. A title's `scrollWidth` is its full width
	 * even while it is cut short.
	 */
	function startNeed(node: HTMLElement) {
		const titles = [...node.querySelectorAll<HTMLElement>('.segment > .text')];
		const full = titles.reduce((sum, title) => sum + title.scrollWidth, 0);
		const shown = titles.reduce((sum, title) => sum + title.clientWidth, 0);
		return node.offsetWidth - shown + Math.min(full, TITLE_ROOM);
	}

	/*
	 * Tell the page how wide each corner is, as `--corner-start` and `--corner-end` on the root, and
	 * whether a date fits in the gap between them (`data-bar-room`). On a phone the feed's sticky
	 * date uses these to sit in the bar itself, between the two groups.
	 */
	function measure(node: HTMLElement) {
		const root = document.documentElement;
		const name = `--corner-${side}`;
		const width = (corner: string) => parseFloat(root.style.getPropertyValue(`--corner-${corner}`)) || 0;
		const inset = () => parseFloat(getComputedStyle(node).top) || 0;
		// The end corner's width with everything in it, remembered while it is condensed.
		let fullWidth = 0;
		const fit = () => {
			if (side !== 'end' || getComputedStyle(node).position !== 'fixed') return;
			if (!crowded) fullWidth = node.offsetWidth;
			const start = width('start-need');
			crowded = start > 0 && fullWidth + start + 3 * inset() > root.clientWidth;
		};
		const update = () => {
			const pinned = getComputedStyle(node).position === 'fixed';
			root.style.setProperty(name, `${pinned ? node.offsetWidth : 0}px`);
			if (side === 'start') {
				root.style.setProperty('--corner-start-need', `${pinned ? startNeed(node) : 0}px`);
				window.dispatchEvent(new Event(EVENT));
			} else {
				fit();
			}
			const gap = root.clientWidth - width('start') - width('end') - 2 * inset();
			root.toggleAttribute('data-bar-room', gap >= DATE_ROOM);
		};
		const observer = new ResizeObserver(update);
		observer.observe(node);
		window.addEventListener('resize', update);
		if (side === 'end') window.addEventListener(EVENT, fit);
		update();
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
				window.removeEventListener(EVENT, fit);
				root.style.removeProperty(name);
				if (side === 'start') {
					root.style.removeProperty('--corner-start-need');
					window.dispatchEvent(new Event(EVENT));
				}
			}
		};
	}
</script>

<!-- Controls pinned to a top corner of the viewport, staying put while the page scrolls. -->
<svelte:element this={as} class="corner corner--{side} corner--phone-{phone} {className}" {...rest} use:measure>
	{@render children()}
</svelte:element>

<style>
	.corner {
		position: fixed;
		top: var(--nav-inset);
		z-index: var(--z-nav);
		display: flex;
		align-items: flex-start;
		gap: var(--nav-inset);
	}

	/* The where-you-are corner gives way to the other one: its titles end in an ellipsis instead. */
	.corner--start {
		left: var(--nav-inset);
		max-width: calc(100% - var(--corner-end, 0px) - 3 * var(--nav-inset));
	}

	.corner--start > :global(*) {
		min-width: 0;
	}

	.corner--end {
		right: var(--nav-inset);
	}

	@media (max-width: 600px) {
		.corner--phone-inline {
			position: static;
			z-index: auto;
		}

		.corner--phone-hidden {
			display: none;
		}
	}
</style>
