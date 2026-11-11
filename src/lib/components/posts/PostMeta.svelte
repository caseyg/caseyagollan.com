<script lang="ts">
	import { Chip } from '$lib/components/ui';
	import WebmentionCounts from '$lib/components/WebmentionCounts.svelte';
	import { POST_TYPE_PLURALS } from '$lib/posts-types';
	import { formatRelativeDate, formatAbsoluteDate } from '$lib/utils/formatDate';

	interface Props {
		type: string;
		date?: string;
		year?: string;
		showInteractions?: boolean;
		permalink: string;
		syndication?: string[];
		showType?: boolean;
		category?: string | string[];
		activeTag?: string;
		indexActivities?: import('$lib/posts-types').Post['indexActivities'];
		/** For replies, likes and reposts: the verb and whose post it acts on. */
		action?: import('$lib/utils/post-details').PostAction;
	}

	let { type, date = '', year, showInteractions = true, permalink, syndication = [], showType = true, category, activeTag, indexActivities, action }: Props = $props();

	function getCategories(cat: string | string[] | undefined): string[] {
		if (!cat) return [];
		return Array.isArray(cat) ? cat : [cat];
	}

	const categories = $derived(getCategories(category));
	const activityTypes = $derived(indexActivities?.filter((activity, i, all) => all.findIndex(other => other.type === activity.type) === i));

	function getTypePlural(t: string): string {
		return POST_TYPE_PLURALS[t] || t + 's';
	}

	const TYPE_ICONS: Record<string, string> = {
		wiki: '📖', book: '📚', like: '♥', repost: '🔁', event: '📅', review: '⭐', itinerary: '✈', food: '🍽', drink: '☕',
		note: '📝',
		article: '📄',
		bookmark: '🔖',
		photo: '📷',
		video: '🎬',
		reply: '💬',
		media: '🎵'
	};

	function getTypeIcon(t: string): string {
		return TYPE_ICONS[t] || '📌';
	}

	function getSyndicationInfo(link: string): { label: string; title: string } {
		if (link.includes('social.coop') || link.includes('mastodon')) {
			return { label: 'Mastodon', title: 'View on Mastodon' };
		} else if (link.includes('bsky.app')) {
			return { label: 'Bluesky', title: 'View on Bluesky' };
		} else if (link.includes('twitter.com') || link.includes('x.com')) {
			return { label: 'X', title: 'View on X' };
		} else {
			let label = link;
			try { label = new URL(link).hostname.replace(/^www\./, ''); } catch { /* keep the raw value */ }
			return { label, title: link };
		}
	}
</script>

<div class="post-meta">
	<div class="meta-group meta-primary">
		{#if showType}
			{#if activityTypes}
				{#each activityTypes as activity, i (activity.permalink)}
					{#if i > 0}<span class="joiner">and</span>{/if}
					<Chip href={activity.permalink} class="post-type" title={formatAbsoluteDate(activity.date)}><span aria-hidden="true">{getTypeIcon(activity.type)}</span> {activity.type === 'like' ? 'liked' : 'reposted'}</Chip>
				{/each}
			{:else}
				<Chip href={type === 'wiki' ? 'https://cag.wiki/' : type === 'book' ? '/library/' : `/type/${getTypePlural(type).toLowerCase()}/`} class="post-type"><span aria-hidden="true">{getTypeIcon(type)}</span> {action?.verb ?? type}</Chip>
			{/if}
		{/if}
		{#each action?.targets ?? [] as target (target.url)}
			<Chip href={target.url} class="post-target {target.classes}" title="View the original post">{target.label}</Chip>
		{/each}
		{#if date}
			<Chip href={permalink} class="u-url permalink" title={formatAbsoluteDate(date)}>
				<time class="dt-published" datetime={date}>{formatRelativeDate(date)}</time>
			</Chip>
		{:else if year}
			<Chip href={permalink} class="u-url permalink" title="Publication year">
				<time datetime={year}>{year}</time>
			</Chip>
		{/if}
		{#each categories as cat (cat)}
			<Chip href="/tag/{cat.toLowerCase()}/" class="p-category" active={cat.toLowerCase() === activeTag?.toLowerCase()}>#{cat}</Chip>
		{/each}
	</div>
	{#if showInteractions}
		<div class="meta-group meta-secondary">
			{#each syndication ?? [] as link (link)}
				{@const synInfo = getSyndicationInfo(link)}
				<Chip href={link} class="u-syndication" title={synInfo.title} target="_blank" rel="noopener">{synInfo.label} <span aria-hidden="true">↗</span></Chip>
			{/each}
			<WebmentionCounts url={permalink} />
		</div>
	{/if}
</div>

<style>
	.post-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}

	/* Chips carry their own padding; pull each group out so text aligns with the column. */
	.meta-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0;
	}

	.meta-primary {
		margin-left: calc(-1 * var(--space-2));
	}

	.meta-secondary {
		margin-right: calc(-1 * var(--space-2));
		margin-left: auto;
	}

	.meta-secondary:empty {
		display: none;
	}

	/* The verb chip and its target read as one phrase. */
	.meta-primary :global(.post-type + .post-target) {
		margin-left: calc(-1 * var(--space-2));
		color: var(--text-secondary);
	}

	.meta-primary :global(.post-target) {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.joiner {
		padding: 0 var(--space-1);
	}

	time {
		font-variant-numeric: tabular-nums;
	}
</style>
