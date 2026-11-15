<script lang="ts">
	import type { Mounted } from 'pele/lazy';

	interface Props {
		/** The diagram in Mermaid syntax. */
		source: string;
		/** Extra classes for the figure. */
		class?: string;
	}

	let { source, class: className = '' }: Props = $props();

	let canvas: HTMLDivElement;
	let drawn = $state(false);
	let failed = $state(false);

	// Pele loads only the diagram types a page uses, after the page is up. Until then, and if it
	// can't draw the source, the Mermaid text shows instead.
	$effect(() => {
		const text = source;
		let diagram: Mounted | undefined;
		let gone = false;
		drawn = false;
		failed = false;
		import('pele/lazy')
			.then(({ mountAsync }) =>
				mountAsync(canvas, text, {
					zoom: 'auto',
					onRender: () => (drawn = true),
					onError: () => (failed = true)
				})
			)
			.then((mounted) => {
				if (gone) mounted.destroy();
				else diagram = mounted;
			})
			.catch(() => (failed = true));
		return () => {
			gone = true;
			diagram?.destroy();
			canvas?.replaceChildren();
		};
	});
</script>

<figure class="mermaid-diagram {className}" class:drawn={drawn && !failed}>
	<!-- Pele measures this box for its width, so it stays in the layout while the source shows. -->
	<div class="canvas" bind:this={canvas} hidden={failed}></div>
	{#if !drawn || failed}
		<div class="source">
			<code>{source.trim()}</code>
		</div>
		{#if failed}<figcaption>This diagram couldn’t be drawn, so here is its Mermaid source.</figcaption>{/if}
	{/if}
</figure>

<style>
	/*
	 * Pele draws with CSS variables, so diagrams take the site's colors: white ink on the gray ground,
	 * translucent fills for nodes and groups, blue for highlights.
	 */
	.mermaid-diagram {
		--pele-bg: var(--bg-primary);
		--pele-fg: var(--text-primary);
		--pele-fg-on-light: #1f1f1f;
		--pele-fg-on-dark: var(--text-primary);
		--pele-muted: var(--text-muted);
		--pele-line: var(--text-secondary);
		--pele-surface: var(--surface-2);
		--pele-surface-alt: var(--surface-1);
		--pele-border: var(--border-strong);
		--pele-accent: var(--accent);
		--pele-error: var(--text-primary);
		--pele-font: var(--font-sans);
		--pele-font-mono: var(--font-mono);
		--pele-title-weight: var(--fw-semibold);
		--pele-heading-weight: var(--fw-semibold);
		--pele-bold-weight: var(--fw-semibold);
		--pele-radius: var(--radius-sm);
		--pele-series-1: blue;
		--pele-series-2: #c2410c;
		--pele-series-3: #15803d;
		--pele-series-4: #be123c;
		--pele-series-5: #0e7490;
		--pele-series-6: #a16207;
		--pele-series-7: #7e22ce;
		--pele-series-8: #78350f;
		margin: 1.5em 0;
		min-width: 0;
	}

	.canvas {
		display: flex;
		justify-content: center;
	}

	.canvas :global(svg.pele) {
		max-width: 100%;
		height: auto;
	}

	/*
	 * Pele sets text on colored fills, such as pie slices, in the background color. On the gray
	 * ground that reads poorly, so it takes white ink, with series colors deep enough to hold it.
	 */
	.canvas :global(svg.pele g[fill='var(--_bg)'] text),
	.canvas :global(svg.pele text[fill='var(--_bg)']) {
		fill: var(--text-primary);
	}

	/* The source while Pele loads, set like a code block. */
	.source {
		padding: var(--space-4);
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
		white-space: pre;
	}

	.source code {
		padding: 0;
		background: none;
		font-family: var(--font-mono);
		font-size: inherit;
	}

	figcaption {
		margin-top: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
