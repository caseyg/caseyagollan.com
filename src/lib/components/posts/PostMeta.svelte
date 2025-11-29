<script lang="ts">
	import WebmentionCounts from '$lib/components/WebmentionCounts.svelte';
	import { POST_TYPE_PLURALS } from '$lib/posts-types';
	import { formatRelativeDate, formatAbsoluteDate } from '$lib/utils/formatDate';

	interface Props {
		type: string;
		date: string;
		permalink: string;
		syndication?: string[];
		showType?: boolean;
	}

	let { type, date, permalink, syndication = [], showType = true }: Props = $props();

	function getTypePlural(t: string): string {
		return POST_TYPE_PLURALS[t] || t + 's';
	}

	const TYPE_ICONS: Record<string, string> = {
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
			<a href="/type/{getTypePlural(type).toLowerCase()}/" class="post-type">{getTypeIcon(type)} {type}</a>
		{/if}
		<a href={permalink} class="u-url permalink" title={formatAbsoluteDate(date)}>
			<span class="permalink-icon">🔗</span>
			<time class="dt-published" datetime={date}>{formatRelativeDate(date)}</time>
		</a>
	</div>
	{#if (syndication && syndication.length > 0)}
		<div class="meta-secondary">
			{#each syndication as link (link)}
				{@const synInfo = getSyndicationInfo(link)}
				<a href={link} class="u-syndication syndication-link" title={synInfo.title} target="_blank" rel="noopener">
					{synInfo.icon}
				</a>
			{/each}
			<WebmentionCounts url={permalink} />
		</div>
	{:else}
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
	.syndication-link {
		color: inherit;
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.post-type:hover,
	.permalink:hover,
	.syndication-link:hover {
		background: rgba(255, 255, 255, 0.15);
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
