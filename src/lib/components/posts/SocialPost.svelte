<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Avatar, Chip } from '$lib/components/ui';
	import { firstPerNetwork, type SocialCardAuthor, type SocialCardSource } from '$lib/social-card';
	import { formatAbsoluteDate, formatShortRelativeDate } from '$lib/utils/formatDate';

	/**
	 * One social post, as Bluesky draws it: avatar on the left, name, handle and time on one line, then the text.
	 * Several in a row inside a SocialCard form a thread, joined by a line between avatars.
	 */
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
		/** Marks this as a standalone h-entry, for the site's own posts that are not already inside one. */
		hEntry?: boolean;
		/** A short note under the meta line, such as who this replies to. */
		context?: Snippet;
		/** Small markers after the time, such as "♥ liked" linking to the like. */
		marks?: { icon: string; label: string; href?: string }[];
		/** Shows the avatar and the name, handle, time and links line. Off, only the post's content is drawn, as a table block with its details hidden. */
		byline?: boolean;
		children: Snippet;
	}

	let { author, date, url, sources = [], editHref, connected = false, hEntry = false, context, marks = [], byline = true, children }: Props = $props();
</script>

<article class="social-post" class:h-entry={hEntry} class:connected class:content-only={!byline}>
	{#if byline}
	<div class="rail" aria-hidden="true">
		<a href={author.url} tabindex="-1"><Avatar src={author.avatar} name={author.name} /></a>
	</div>
	{/if}
	<div class="main">
		{#if byline}
		<div class="meta">
			<span class="meta-text">
			<a class="author" class:p-author={hEntry} class:h-card={hEntry} href={author.url}>
				<strong class="name" class:p-name={hEntry}>{author.name}</strong>
				{#if author.handle}<span class="handle">{author.handle}</span>{/if}
			</a>
			{#if date}
				<span class="dot" aria-hidden="true">·</span>
				<a class="time" class:u-url={hEntry} href={url} title={formatAbsoluteDate(date)}><time class:dt-published={hEntry} datetime={date}>{formatShortRelativeDate(date)}</time></a>
			{/if}
			{#each marks as mark (mark.label)}
				<svelte:element this={mark.href ? 'a' : 'span'} class="mark" href={mark.href}><span aria-hidden="true">{mark.icon}</span> {mark.label}</svelte:element>
			{/each}
			</span>
			{#if sources.length || editHref}
				<span class="links">
					{#each firstPerNetwork(sources) as source (source.url)}
						{#if source.hidden}<a class={source.className} href={source.url} hidden aria-hidden="true" tabindex="-1">{source.title}</a>
						{:else}<Chip href={source.url} size="sm" class={source.className} title={source.title} aria-label={source.title} target="_blank" rel="noopener">{source.label}</Chip>{/if}
					{/each}
					{#if editHref}<Chip href={editHref} size="sm" class="edit-post" rel="nofollow" title="Edit this post" aria-label="Edit this post">✏️</Chip>{/if}
				</span>
			{/if}
		</div>
		{/if}
		{#if context && byline}<div class="context">{@render context()}</div>{/if}
		<div class="body">{@render children()}</div>
	</div>
</article>

<style>
	.social-post {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr);
		column-gap: var(--space-3);
	}

	.content-only {
		grid-template-columns: minmax(0, 1fr);
	}

	.rail a {
		color: inherit;
		text-decoration: none;
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
	}

	.connected .main {
		padding-bottom: var(--space-4);
	}

	/* Name, handle and time wrap together; the links out keep their place at the right. */
	.meta {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
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

	/* As on Bluesky, a long handle is cut short so the time stays on the line. */
	.meta-text {
		display: flex;
		flex: 1;
		white-space: nowrap;
		align-items: baseline;
		column-gap: var(--space-1);
		min-width: 0;
	}

	.author {
		display: inline-flex;
		align-items: baseline;
		column-gap: var(--space-1);
		min-width: 0;
		overflow: hidden;
	}

	.name,
	.handle {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.name {
		flex-shrink: 0;
		max-width: 70%;
	}

	.name {
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
	}

	.mark {
		margin-left: var(--space-1);
		font-size: var(--fs-xs);
	}



	.time {
		font-variant-numeric: tabular-nums;
	}

	.links {
		display: inline-flex;
		flex: none;
		margin: calc(-1 * var(--space-1)) 0;
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

	/* On phones the post uses the full width: a small avatar beside the name row, then the text and media below both,
	   as Bluesky and Mastodon do. The thread line becomes a short stroke between posts, under the avatars. */
	@media (max-width: 480px) {
		.social-post {
			position: relative;
			grid-template-columns: 2rem minmax(0, 1fr);
			column-gap: var(--space-2);
		}

		.main {
			display: contents;
		}

		.rail :global(.avatar) {
			width: 2rem;
			height: 2rem;
		}

		.meta {
			grid-column: 2;
			align-self: center;
		}

		.context,
		.body {
			grid-column: 1 / -1;
		}

		.body {
			margin-top: var(--space-2);
		}

		.connected {
			padding-bottom: var(--space-5);
		}

		.connected .rail::after {
			display: none;
		}

		.connected::after {
			content: '';
			position: absolute;
			bottom: var(--space-1);
			left: calc(1rem - 1px);
			width: 2px;
			height: calc(var(--space-5) - 2 * var(--space-1));
			border-radius: 1px;
			background: var(--border);
		}
	}
</style>
