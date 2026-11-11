<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Extra classes, e.g. microformats such as `e-content`. */
		class?: string;
		children: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<div class="prose {className}">
	{@render children()}
</div>

<style>
	/* Long-form rhythm for rendered Markdown and HTML. */
	.prose {
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

	.prose :global(hr) {
		margin: 2em 0;
		border: 0;
		border-top: 1px solid var(--border);
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

	/* oEmbed video containers */
	.prose :global(.embed) {
		margin: 1.5em 0;
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
