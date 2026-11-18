<script lang="ts">
	import type { Snippet } from 'svelte';
	import { mermaidBlocks } from './mermaidBlocks';
	import { subscribeEmbeds } from './subscribeEmbeds';

	interface Props {
		/** Extra classes, e.g. microformats such as `e-content`. */
		class?: string;
		children: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<!-- Mermaid code blocks are drawn as diagrams, and subscribe lines become the signup form, once the page is up. -->
<div class="prose {className}" {@attach mermaidBlocks} {@attach subscribeEmbeds}>
	{@render children()}
</div>

<style>
	/* Long-form rhythm for rendered Markdown and HTML. */
	.prose {
		display: flow-root;
		margin: 0;
		line-height: var(--lh-relaxed);
		text-wrap: pretty;
		hanging-punctuation: first;
	}

	.prose :global(:first-child) {
		margin-top: 0;
	}

	.prose :global(:last-child) {
		margin-bottom: 0;
	}

	.prose :global(p) {
		margin: 0 0 1em;
	}

	.prose :global(:is(h1, h2, h3, h4)) {
		margin: 1.75em 0 0.5em;
		font-weight: var(--fw-semibold);
		line-height: 1.3;
		letter-spacing: var(--tracking-tight);
		text-wrap: balance;
	}

	.prose :global(:is(h1, h2)) {
		font-size: var(--fs-xl);
	}

	.prose :global(h3) {
		font-size: var(--fs-lg);
	}

	.prose :global(h4) {
		font-size: 1em;
	}

	.prose :global(a) {
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-color: rgb(255 255 255 / 0.45);
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
		transition: text-decoration-color var(--duration) var(--ease);
	}

	.prose :global(a:hover) {
		text-decoration-color: currentColor;
	}

	.prose :global(strong) {
		font-weight: var(--fw-semibold);
	}

	.prose :global(code) {
		padding: 0.1em 0.3em;
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		font-family: var(--font-mono);
		font-size: 0.88em;
	}

	.prose :global(pre) {
		margin: 1.25em 0;
		padding: var(--space-4);
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	/* A code block that now holds its diagram, which brings its own spacing. */
	.prose :global(pre.mermaid-block) {
		margin: 0;
		padding: 0;
		overflow: visible;
		background: none;
		font-size: inherit;
		line-height: inherit;
		white-space: normal;
	}

	.prose :global(pre code) {
		padding: 0;
		background: none;
		font-size: inherit;
	}

	.prose :global(blockquote) {
		margin: 1.25em 0;
		padding-left: var(--space-4);
		border-left: 2px solid var(--border-strong);
		color: var(--text-secondary);
		font-style: italic;
	}

	.prose :global(:is(ul, ol)) {
		margin: 1em 0;
		padding-left: 1.4em;
	}

	.prose :global(li) {
		margin-bottom: 0.4em;
	}

	.prose :global(li::marker) {
		color: var(--text-muted);
	}

	/* Section breaks read as three centered dots rather than a rule. Keep in step with Divider.svelte. */
	.prose :global(hr) {
		margin: 2em 0;
		border: 0;
		overflow: visible;
		height: auto;
		color: var(--border);
		text-align: center;
		line-height: 1;
	}

	.prose :global(hr::after) {
		content: '\2022\2022\2022';
		letter-spacing: 0.75em;
		/* Letter spacing trails the last dot, so pull it back to stay centered. */
		margin-right: -0.75em;
	}

	.prose :global(img) {
		max-width: 100%;
		height: auto;
		margin: 1em 0;
		border-radius: var(--radius-sm);
	}

	.prose :global(figcaption) {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	/* Screenshots and asides that sit beside the text: <figure class="align-right">. */
	.prose :global(figure) {
		margin: 1.5em 0;
	}

	.prose :global(figure img) {
		display: block;
		margin: 0;
	}

	.prose :global(figure figcaption) {
		margin-top: var(--space-2);
	}

	.prose :global(figure.align-right) {
		float: right;
		clear: right;
		width: min(45%, 24rem);
		margin: 0.35em 0 1.25em var(--space-6);
	}

	/* Screenshots share the page's gray ground, so a hairline keeps their edges. */
	.prose :global(figure.align-right img) {
		width: 100%;
		outline: 1px solid var(--border);
		outline-offset: -1px;
	}

	.prose :global(figure.align-right.narrow) {
		width: min(36%, 15rem);
	}

	.prose :global(:is(h2, h3, hr)) {
		clear: both;
	}

	@media (max-width: 640px) {
		.prose :global(figure.align-right),
		.prose :global(figure.align-right.narrow) {
			float: none;
			width: auto;
			margin: 1.5em 0;
		}

		.prose :global(figure.align-right.narrow img) {
			max-width: 60%;
		}
	}

	.prose :global(table) {
		width: 100%;
		margin: 1.25em 0;
		border-collapse: collapse;
		font-size: var(--fs-sm);
		font-variant-numeric: tabular-nums;
	}

	.prose :global(:is(th, td)) {
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		border-bottom: 1px solid var(--border-subtle);
		text-align: left;
	}

	.prose :global(mark) {
		padding: 0 0.15em;
		border-radius: 2px;
		background: var(--accent);
		color: var(--text-primary);
	}

	/* Numbered footnotes: a small raised link in the text, the notes in a quieter list at the end. */
	.prose :global(sup.footnote-ref) {
		line-height: 0;
	}

	.prose :global(sup.footnote-ref a) {
		padding: 0 0.1em;
		text-decoration: none;
		font-size: 0.8em;
		font-variant-numeric: tabular-nums;
	}

	.prose :global(.footnotes) {
		margin-top: 2.5em;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	.prose :global(.footnotes li:target) {
		color: var(--text-primary);
	}

	.prose :global(.footnote-back) {
		text-decoration: none;
	}

	/* oEmbed video containers */
	.prose :global(.embed) {
		margin: 1.5em 0;
	}

	/* A table from /tables, framed read-only at a landscape size, with a link to open it whole. */
	.prose :global(.embed-table iframe) {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
	}

	.prose :global(.embed-table .embed-caption) {
		margin: var(--space-1) 0 0;
		font-size: var(--fs-sm);
	}

	/* A subscribe line (a bare caseyagollan.com/subscribe link): the signup form and feeds in a quiet frame. */
	.prose :global(.embed-subscribe) {
		max-width: 28rem;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-1);
	}

	.prose :global(.embed-subscribe > p) {
		margin: 0;
		padding: var(--space-2);
		font-size: var(--fs-sm);
	}

	/* Once the panel is drawn, the written line is only for feeds and readers without JavaScript. */
	.prose :global(.embed-subscribe--live > p) {
		display: none;
	}

	.prose :global(.embed-video) {
		position: relative;
		height: 0;
		padding-bottom: 56.25%;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
	}

	.prose :global(.embed-video iframe) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
</style>
