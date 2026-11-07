<script lang="ts">
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
	}

	let { type, date = '', year, showInteractions = true, permalink, syndication = [], showType = true, category, activeTag }: Props = $props();

	function getCategories(cat: string | string[] | undefined): string[] {
		if (!cat) return [];
		return Array.isArray(cat) ? cat : [cat];
	}

	const categories = $derived(getCategories(category));

	function getTypePlural(t: string): string {
		return POST_TYPE_PLURALS[t] || t + 's';
	}

	const TYPE_ICONS: Record<string, string> = {
		book: '📚', like: '♥', repost: '🔁', event: '📅', review: '⭐', itinerary: '✈', food: '🍽', drink: '☕',
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

	function getSyndicationInfo(link: string): { icon: string; title: string } {
		if (link.includes('social.coop') || link.includes('mastodon')) {
			return { icon: '🐘', title: 'View on Mastodon' };
		} else if (link.includes('bsky.app')) {
			return { icon: '🦋', title: 'View on Bluesky' };
		} else if (link.includes('twitter.com') || link.includes('x.com')) {
			return { icon: '🐦', title: 'View on X' };
		} else {
			return { icon: '🔗', title: link };
		}
	}
</script>

<div class="post-meta">
	<div class="meta-primary">
		{#if showType}
			<a href={type === 'book' ? '/library/' : `/type/${getTypePlural(type).toLowerCase()}/`} class="post-type">{getTypeIcon(type)} {type}</a>
		{/if}
		{#if date}
			<a href={permalink} class="u-url permalink" title={formatAbsoluteDate(date)}>
				<span class="permalink-icon">🔗</span>
				<time class="dt-published" datetime={date}>{formatRelativeDate(date)}</time>
			</a>
		{:else if year}
			<a href={permalink} class="u-url permalink" title="Publication year">
				<span class="permalink-icon">🔗</span>
				<time datetime={year}>{year}</time>
			</a>
		{/if}
		{#each categories as cat (cat)}
			<a href="/tag/{cat.toLowerCase()}/" class="p-category category-tag" class:active={cat.toLowerCase() === activeTag?.toLowerCase()}>#{cat}</a>
		{/each}
	</div>
	{#if showInteractions && (syndication && syndication.length > 0)}
		<div class="meta-secondary">
			{#each syndication as link (link)}
				{@const synInfo = getSyndicationInfo(link)}
				<a href={link} class="u-syndication syndication-link" title={synInfo.title} target="_blank" rel="noopener">
					{synInfo.icon}
				</a>
			{/each}
			<WebmentionCounts url={permalink} />
		</div>
	{:else if showInteractions}
		<WebmentionCounts url={permalink} />
	{/if}
</div>

<style>
	.post-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.5rem;
	}

	.meta-primary {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		margin-left: -0.5rem;
	}

	.meta-secondary {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		margin-right: -0.5rem;
	}

	.post-type,
	.permalink,
	.syndication-link,
	.category-tag {
		color: inherit;
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.post-type:hover,
	.permalink:hover,
	.syndication-link:hover,
	.category-tag:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.category-tag.active {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.permalink {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.permalink-icon {
		opacity: 0.6;
		font-size: 0.7em;
	}

	.permalink:hover .permalink-icon {
		opacity: 1;
	}

	.syndication-link {
		font-size: 0.875rem;
		opacity: 0.7;
	}

	.syndication-link:hover {
		opacity: 1;
	}
</style>
