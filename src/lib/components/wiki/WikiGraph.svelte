<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphLayout } from '$lib/wiki/graph-layout';
	import { wikiPath } from '$lib/wiki/resolve';

	interface Props {
		/** Positions from `layoutGraph`, worked out ahead of time so the graph arrives settled. */
		layout: GraphLayout;
		/** The page being read, drawn in blue at the middle. */
		current?: string;
		/** `all` names every page; `auto` names a small graph's pages, or a large one's hubs and whatever the pointer is near. */
		labels?: 'all' | 'auto';
		/** Names the graph for assistive technology. */
		label?: string;
		class?: string;
	}

	let { layout, current, labels = 'auto', label = 'Graph of linked pages', class: className = '' }: Props = $props();

	let svg: SVGSVGElement | undefined = $state();
	let hovered: string | null = $state(null);
	// Text is sized in viewBox units; this keeps it near 11px however wide the graph is drawn.
	let scale = $state(1);

	const bySlug = $derived(new Map(layout.nodes.map((node) => [node.slug, node])));
	const edges = $derived(layout.links.flatMap((link) => {
		const source = bySlug.get(link.source);
		const target = bySlug.get(link.target);
		return source && target ? [{ key: `${link.source}→${link.target}`, source, target }] : [];
	}));
	const neighbors = $derived.by(() => {
		const focus = hovered ?? current;
		const near = new Set<string>(focus ? [focus] : []);
		if (focus) for (const link of layout.links) {
			if (link.source === focus) near.add(link.target);
			if (link.target === focus) near.add(link.source);
		}
		return near;
	});
	const threshold = $derived.by(() => {
		const degrees = layout.nodes.map((node) => node.degree).sort((a, b) => b - a);
		return Math.max(2, degrees[Math.floor(degrees.length * (degrees.length > 40 ? 0.06 : 0.12))] ?? 0);
	});
	// Resting, the graph names the page being read and the hubs; pointing at a page names its neighbours.
	// A small graph has room to name everything.
	const named = (slug: string, degree: number) => labels === 'all' || layout.nodes.length <= 12 || slug === current || (hovered ? neighbors.has(slug) : degree >= threshold);

	onMount(() => {
		if (!svg) return;
		const width = Number(layout.viewBox.split(' ')[2]);
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width) scale = width / entry.contentRect.width;
		});
		observer.observe(svg);
		return () => observer.disconnect();
	});
</script>

<svg
	bind:this={svg}
	class="wiki-graph {className}"
	class:focused={!!hovered}
	viewBox={layout.viewBox}
	aria-label={label}
	style:--label-size="{11 * scale}px"
	style:--stroke="{scale}px"
>
	<g class="links" aria-hidden="true">
		{#each edges as edge (edge.key)}
			<line x1={edge.source.x} y1={edge.source.y} x2={edge.target.x} y2={edge.target.y} class:near={!!hovered && (edge.source.slug === hovered || edge.target.slug === hovered)} />
		{/each}
	</g>
	<g class="nodes">
		{#each layout.nodes as node (node.slug)}
			<a
				href={wikiPath(node.slug)}
				class="node"
				class:current={node.slug === current}
				class:near={neighbors.has(node.slug)}
				aria-label={node.title}
				aria-current={node.slug === current ? 'page' : undefined}
				onpointerenter={() => (hovered = node.slug)}
				onpointerleave={() => (hovered = null)}
				onfocus={() => (hovered = node.slug)}
				onblur={() => (hovered = null)}
			>
				<circle cx={node.x} cy={node.y} r={node.r} />
				{#if named(node.slug, node.degree)}
					<text x={node.x} y={node.y + node.r} dy="1.1em" aria-hidden="true">{node.title}</text>
				{/if}
			</a>
		{/each}
	</g>
</svg>

<style>
	.wiki-graph {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		touch-action: manipulation;
	}

	line {
		stroke: var(--border-strong);
		stroke-width: var(--stroke);
		opacity: 0.6;
		transition: opacity var(--duration) var(--ease), stroke var(--duration) var(--ease);
	}

	.focused line {
		opacity: 0.2;
	}

	.focused line.near {
		stroke: var(--text-primary);
		opacity: 1;
	}

	.node {
		cursor: pointer;
		outline: none;
		transition: opacity var(--duration) var(--ease);
	}

	.focused .node:not(.near) {
		opacity: 0.35;
	}

	circle {
		fill: var(--text-secondary);
		transition: fill var(--duration) var(--ease);
	}

	.node.current circle {
		fill: var(--accent);
		stroke: var(--text-primary);
		stroke-width: calc(var(--stroke) * 1.5);
	}

	.node:hover circle,
	.node:focus-visible circle {
		fill: var(--text-primary);
	}

	.node:focus-visible circle {
		stroke: var(--text-primary);
		stroke-width: calc(var(--stroke) * 2);
		stroke-dasharray: calc(var(--stroke) * 2);
	}

	text {
		fill: var(--text-primary);
		font-family: var(--font-sans);
		font-size: var(--label-size);
		text-anchor: middle;
		paint-order: stroke;
		stroke: var(--bg-primary);
		stroke-width: calc(var(--stroke) * 3);
		stroke-linejoin: round;
		pointer-events: none;
		user-select: none;
	}

	.node.current text {
		font-weight: var(--fw-semibold);
	}

	@media (prefers-reduced-motion: reduce) {
		line,
		.node,
		circle {
			transition: none;
		}
	}
</style>
