<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Avatar, Chip } from '$lib/components/ui';
	import type { SocialCardAuthor, SocialCardSource } from '$lib/social-card';
	import { formatAbsoluteDate, formatShortRelativeDate } from '$lib/utils/formatDate';

	/** One post in a conversation thread: avatar on the left, a single meta line, then the text. */
	interface Props {
		author: SocialCardAuthor;
		/** When it was posted; links to `url`. */
		date?: string;
		url?: string;
		/** Outbound copies of this post (🦋, 🐘), kept small at the end of the meta line. */
		sources?: SocialCardSource[];
		/** The owner's edit link for the site's own posts. */
		editHref?: string;
		/** Draws the thread line down to the next post. */
		connected?: boolean;
		/** Marks this as one of the site's own posts (an h-entry). */
		own?: boolean;
		/** A short note under the meta line, such as who this replies to. */
		context?: Snippet;
		/** Small markers after the time, such as "♥ liked". */
		badges?: Snippet;
		children: Snippet;
	}

	let { author, date, url, sources = [], editHref, connected = false, own = false, context, badges, children }: Props = $props();
</script>

<article class="thread-entry" class:h-entry={own} class:connected>
	<div class="rail" aria-hidden="true">
		<a href={author.url} tabindex="-1"><Avatar src={author.avatar} name={author.name} /></a>
	</div>
	<div class="main">
		<div class="meta">
			<a class="author" class:p-author={own} class:h-card={own} href={author.url}>
				<strong class="name" class:p-name={own}>{author.name}</strong>
				{#if author.handle}<span class="handle">{author.handle}</span>{/if}
			</a>
			{#if date}
				<span class="dot" aria-hidden="true">·</span>
				<a class="time" class:u-url={own} href={url} title={formatAbsoluteDate(date)}><time class:dt-published={own} datetime={date}>{formatShortRelativeDate(date)}</time></a>
			{/if}
			{#if badges}{@render badges()}{/if}
			{#if sources.length || editHref}
				<span class="links">
					{#each sources as source (source.url)}
						<Chip href={source.url} size="sm" class={source.className} title={source.title} aria-label={source.title} target="_blank" rel="noopener">{source.label}</Chip>
					{/each}
					{#if editHref}<Chip href={editHref} size="sm" class="edit-post" rel="nofollow" title="Edit this post" aria-label="Edit this post">✏️</Chip>{/if}
				</span>
			{/if}
		</div>
		{#if context}<div class="context">{@render context()}</div>{/if}
		<div class="body">{@render children()}</div>
	</div>
</article>

<style>
	.thread-entry {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr);
		column-gap: var(--space-3);
	}

	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* The line runs from under this avatar to the next one, as on Bluesky. */
	.connected .rail::after {
		content: '';
		flex: 1;
		width: 2px;
		margin-top: var(--space-1);
		border-radius: 1px;
		background: var(--border);
	}

	.main {
		min-width: 0;
		padding-bottom: var(--space-4);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: var(--space-1);
		min-height: 1.5rem;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.meta a {
		color: inherit;
		text-decoration: none;
	}

	.meta a:hover {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.author {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: var(--space-1);
		min-width: 0;
	}

	.name {
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
	}

	.handle {
		overflow-wrap: anywhere;
	}

	.time {
		font-variant-numeric: tabular-nums;
	}

	.links {
		display: inline-flex;
		align-self: center;
		margin: calc(-1 * var(--space-1)) 0 calc(-1 * var(--space-1)) auto;
	}

	.context {
		margin-top: var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.body {
		margin-top: var(--space-1);
		line-height: var(--lh-normal);
		overflow-wrap: anywhere;
		text-wrap: pretty;
	}

	.body :global(p) {
		margin: 0 0 var(--space-2);
	}

	.body :global(p:last-child) {
		margin-bottom: 0;
	}
</style>
