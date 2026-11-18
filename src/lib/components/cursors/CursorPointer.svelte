<script lang="ts">
	import type { Snippet } from 'svelte';
	import { countryFlag, cursorInk } from '$lib/cursors';

	interface Props {
		color: string;
		/** Two-letter country code, shown as a flag beside the pointer when there's no message. */
		country?: string;
		/** What this visitor is saying, in a bubble by the pointer. */
		message?: string;
		/** Replaces the message bubble's text: the visitor's own chat field. */
		field?: Snippet;
		/** Hides the arrow, for your own cursor, where the real pointer already is. */
		bubbleOnly?: boolean;
		/** Puts the bubble left of the pointer, near the window's right edge. */
		flipX?: boolean;
		/** Puts the bubble above the pointer, near the window's bottom edge. */
		flipY?: boolean;
	}

	let { color, country, message, field, bubbleOnly = false, flipX = false, flipY = false }: Props = $props();

	const flag = $derived(countryFlag(country));
	const ink = $derived(cursorInk(color));
</script>

<!--
	Someone else's pointer on the page, in their color, with what they're saying beside it.
	Purely visual: the layer around it ignores the mouse, and screen readers skip it.
-->
<div class="cursor-pointer" class:flip-x={flipX} class:flip-y={flipY} style:--cursor-color={color} style:--cursor-ink={ink} aria-hidden={field ? undefined : 'true'}>
	{#if !bubbleOnly}
		<svg class="arrow" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
			<path d="M2 1.5 16 7.4 9.6 9.6 7.4 16Z" />
		</svg>
	{/if}
	{#if field}
		<div class="bubble bubble--field">{@render field()}</div>
	{:else if message}
		<div class="bubble">{message}</div>
	{:else if flag && !bubbleOnly}
		<span class="flag">{flag}</span>
	{/if}
</div>

<style>
	.cursor-pointer {
		position: relative;
		width: 0;
		height: 0;
		font-family: var(--font-sans);
	}

	.arrow {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35));
	}

	.arrow path {
		fill: var(--cursor-color);
		stroke: white;
		stroke-width: 1.25;
		stroke-linejoin: round;
	}

	.bubble,
	.flag {
		position: absolute;
		top: 16px;
		left: 14px;
		white-space: nowrap;
	}

	.bubble {
		max-width: min(20rem, 70vw);
		overflow: hidden;
		text-overflow: ellipsis;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-lg);
		border-top-left-radius: var(--radius-sm);
		background: var(--cursor-color);
		color: var(--cursor-ink);
		font-size: var(--fs-sm);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
	}

	.bubble--field {
		max-width: none;
		overflow: visible;
	}

	.flag {
		top: 14px;
		left: 12px;
		font-size: var(--fs-sm);
		line-height: 1;
	}

	.flip-x .bubble {
		left: auto;
		right: 0;
		border-top-left-radius: var(--radius-lg);
		border-top-right-radius: var(--radius-sm);
	}

	.flip-y .bubble {
		top: auto;
		bottom: 4px;
		border-top-left-radius: var(--radius-lg);
		border-bottom-left-radius: var(--radius-sm);
	}

	.flip-x.flip-y .bubble {
		border-top-right-radius: var(--radius-lg);
		border-bottom-left-radius: var(--radius-lg);
		border-bottom-right-radius: var(--radius-sm);
	}
</style>
