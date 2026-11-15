<script lang="ts">
	import { Heading } from '$lib/components/ui';
	import { wikiPath } from '$lib/wiki/resolve';
	import type { WikiPageSummary } from '$lib/wiki/types';

	interface Props {
		/** Pages that link to this one. */
		pages: Pick<WikiPageSummary, 'slug' | 'title' | 'excerpt'>[];
	}

	let { pages }: Props = $props();
	const id = $props.id();
</script>

<section class="wiki-backlinks" aria-labelledby={id} data-wiki-previews>
	<Heading level={2} size="label" {id}>Linked from{#if pages.length}&nbsp;<span class="count">{pages.length}</span>{/if}</Heading>
	{#if pages.length}
		<ul>
			{#each pages as page (page.slug)}
				<li>
					<a href={wikiPath(page.slug)}>{page.title}</a>
					{#if page.excerpt}<p>{page.excerpt}</p>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No other page links here yet.</p>
	{/if}
</section>

<style>
	.wiki-backlinks {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.count {
		font-variant-numeric: tabular-nums;
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		color: var(--text-primary);
		font-weight: var(--fw-medium);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	p {
		display: -webkit-box;
		margin: var(--space-1) 0 0;
		overflow: hidden;
		color: var(--text-muted);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.empty {
		margin: 0;
	}
</style>
