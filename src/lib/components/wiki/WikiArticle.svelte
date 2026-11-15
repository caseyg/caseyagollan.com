<script lang="ts">
	import { Chip, Heading, Prose } from '$lib/components/ui';
	import type { WikiPage } from '$lib/wiki/types';

	interface Props {
		page: Pick<WikiPage, 'title' | 'url' | 'tags' | 'year' | 'fields' | 'html'>;
		/** Show the page's title. The wiki's home page leaves it to the trail. */
		showTitle?: boolean;
	}

	let { page, showTitle = true }: Props = $props();
</script>

<article class="wiki-article">
	<header class="header">
		{#if showTitle}<Heading level={1} size="title">{page.title}</Heading>{/if}
		<div class="meta">
			{#each page.tags as tag (tag)}
				<Chip href="/wiki/?tag={encodeURIComponent(tag)}">#{tag}</Chip>
			{/each}
			{#if page.year}<Chip>{page.year}</Chip>{/if}
			<!-- The same page on cag.wiki, for anyone who wants the original. -->
			<Chip href={page.url} class="source" target="_blank" rel="noopener" title="This page on cag.wiki, Casey's Obsidian wiki">View on cag.wiki ↗</Chip>
		</div>
		{#if page.fields.length}
			<dl class="fields">
				{#each page.fields as field, index (index)}
					<div class="field">
						<dt>{field.name}</dt>
						<dd>{@html field.html}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	</header>
	<Prose class="wiki-body">
		{@html page.html}
	</Prose>
</article>

<style>
	.wiki-article {
		min-width: 0;
	}

	.header {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-left: calc(-1 * var(--space-2));
	}

	.meta :global(.source) {
		color: var(--text-muted);
	}

	/* Details such as an author, as Obsidian shows a page's properties: a quiet label beside each value. */
	.fields {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font-size: var(--fs-sm);
	}

	.field {
		display: contents;
	}

	.fields dt {
		color: var(--text-muted);
	}

	.fields dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.fields :global(a) {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--text-muted);
		text-underline-offset: var(--underline-offset);
	}

	/* A link that leaves the site says so, as Quartz and Obsidian Publish mark them. */
	.wiki-article :global(a.external::after) {
		content: '\2009↗';
		font-size: 0.85em;
		color: var(--text-muted);
	}

	/* A link to a page that isn't published reads as plain text with a dotted underline, as Obsidian shows it. */
	.wiki-article :global(.wiki-link-missing) {
		color: var(--text-secondary);
		text-decoration: underline dotted;
		text-decoration-color: var(--text-muted);
		text-underline-offset: var(--underline-offset);
		cursor: help;
	}

	/* Another page shown inside this one. */
	.wiki-article :global(.wiki-embed) {
		margin: 1.25em 0;
		padding: var(--space-3) var(--space-4);
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--surface-1);
	}

	.wiki-article :global(.wiki-embed-title) {
		display: block;
		margin-bottom: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		text-decoration: none;
	}

	.wiki-article :global(.wiki-embed-title:hover) {
		color: var(--text-primary);
	}

	/* Headings are link targets; leave room for the pinned top bar when one is jumped to. */
	.wiki-article :global(:is(h1, h2, h3, h4, h5, h6, li)[id]) {
		scroll-margin-top: calc(var(--sticky-top, 0px) + var(--space-5));
	}
</style>
