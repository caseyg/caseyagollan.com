<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface WebmentionAuthor {
		name: string;
		url: string;
		photo: string;
	}

	interface WebmentionContent {
		html?: string;
		text?: string;
		value?: string;
	}

	interface Webmention {
		'wm-id': number;
		'wm-property': 'like-of' | 'repost-of' | 'in-reply-to' | 'mention-of';
		'wm-target': string;
		url: string;
		author: WebmentionAuthor;
		published?: string;
		content?: WebmentionContent;
	}

	interface Props {
		url: string;
	}

	let { url }: Props = $props();

	let likes = $state<Webmention[]>([]);
	let reposts = $state<Webmention[]>([]);
	let replies = $state<Webmention[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function sanitizeHtml(html: string): string {
		// Basic HTML sanitization - allow only safe tags
		const div = document.createElement('div');
		div.innerHTML = html;

		// Remove script tags and event handlers
		const scripts = div.querySelectorAll('script');
		scripts.forEach(s => s.remove());

		// Only allow safe tags
		const allowedTags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br'];
		const allElements = div.querySelectorAll('*');
		allElements.forEach(el => {
			if (!allowedTags.includes(el.tagName.toLowerCase())) {
				// Replace with text content
				el.replaceWith(document.createTextNode(el.textContent || ''));
			} else if (el.tagName.toLowerCase() === 'a') {
				// Only allow href on anchors, remove other attributes
				const href = el.getAttribute('href');
				Array.from(el.attributes).forEach(attr => {
					if (attr.name !== 'href') {
						el.removeAttribute(attr.name);
					}
				});
				if (href) {
					el.setAttribute('target', '_blank');
					el.setAttribute('rel', 'noopener');
				}
			}
		});

		return div.innerHTML;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function truncateUrl(urlStr: string, maxLength = 50): string {
		if (urlStr.length <= maxLength) return urlStr;
		return urlStr.slice(0, maxLength) + '...';
	}

	async function fetchWebmentions() {
		if (!browser) return;

		const targetUrl = `https://caseyagollan.com${url}`;
		const apiUrl = `https://webmention.io/api/mentions.jf2?target=${encodeURIComponent(targetUrl)}&per-page=100`;

		try {
			const response = await fetch(apiUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch webmentions: ${response.status}`);
			}

			const data = await response.json();
			const mentions: Webmention[] = data.children || [];

			// Sort by wm-id (chronological)
			mentions.sort((a, b) => a['wm-id'] - b['wm-id']);

			// Categorize webmentions
			likes = mentions.filter(m => m['wm-property'] === 'like-of');
			reposts = mentions.filter(m => m['wm-property'] === 'repost-of');
			replies = mentions.filter(m =>
				m['wm-property'] === 'in-reply-to' ||
				(m['wm-property'] === 'mention-of' && m.content)
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load webmentions';
			console.error('Webmentions error:', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchWebmentions();
	});
</script>

{#if !loading && (likes.length > 0 || reposts.length > 0 || replies.length > 0)}
	<section class="webmentions" id="webmentions">
		<h3>Webmentions</h3>

		{#if likes.length > 0}
			<div class="webmentions__facepile">
				<h4>⭐ {likes.length} favorite{likes.length !== 1 ? 's' : ''}</h4>
				<ul class="webmentions__faces">
					{#each likes as like (like['wm-id'])}
						<li>
							<a
								href={like.author.url}
								target="_blank"
								rel="noopener"
								title={like.author.name}
							>
								{#if like.author.photo}
									<img
										src={like.author.photo}
										alt={like.author.name}
										loading="lazy"
										width="48"
										height="48"
									/>
								{:else}
									<span class="avatar-placeholder">{like.author.name?.charAt(0) || '?'}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if reposts.length > 0}
			<div class="webmentions__facepile">
				<h4>🔁 {reposts.length} repost{reposts.length !== 1 ? 's' : ''}</h4>
				<ul class="webmentions__faces">
					{#each reposts as repost (repost['wm-id'])}
						<li>
							<a
								href={repost.author.url}
								target="_blank"
								rel="noopener"
								title={repost.author.name}
							>
								{#if repost.author.photo}
									<img
										src={repost.author.photo}
										alt={repost.author.name}
										loading="lazy"
										width="48"
										height="48"
									/>
								{:else}
									<span class="avatar-placeholder">{repost.author.name?.charAt(0) || '?'}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if replies.length > 0}
			<h4>💬 {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</h4>
			<ol class="webmentions__list">
				{#each replies as reply (reply['wm-id'])}
					<li class="webmentions__item">
						{#if reply['wm-property'] === 'mention-of' && !reply.content}
							<div class="webmention webmention--mention h-cite">
								<span class="webmention__icon">🔗</span>
								<span class="webmention__text">
									mentioned by <a href={reply.url} target="_blank" rel="noopener" class="u-url">{truncateUrl(reply.url)}</a>
								</span>
							</div>
						{:else}
							<article class="webmention h-cite">
								<div class="webmention__author p-author h-card">
									{#if reply.author.photo}
										<img
											class="u-photo"
											src={reply.author.photo}
											alt={reply.author.name}
											width="48"
											height="48"
										/>
									{:else}
										<span class="avatar-placeholder">{reply.author.name?.charAt(0) || '?'}</span>
									{/if}
									{#if reply.author.name}
										<a
											class="p-name u-url"
											href={reply.author.url}
											target="_blank"
											rel="noopener"
										>{reply.author.name}</a>
									{:else if reply.author.url}
										<a
											class="p-name u-url"
											href={reply.author.url}
											target="_blank"
											rel="noopener"
										>{truncateUrl(reply.author.url, 30)}</a>
									{:else}
										<span class="p-name">Unknown</span>
									{/if}
								</div>
								{#if reply.content}
									<div class="webmention__content p-content">
										{#if reply.content.html}
											{@html sanitizeHtml(reply.content.html)}
										{:else if reply.content.text}
											{reply.content.text}
										{:else if reply.content.value}
											{@html sanitizeHtml(reply.content.value)}
										{/if}
									</div>
								{/if}
								<footer class="webmention__meta">
									{#if reply.published}
										<time class="dt-published" datetime={reply.published}>
											{formatDate(reply.published)}
										</time>
									{/if}
									<span class="webmention__source">
										via <a href={reply.url} target="_blank" rel="noopener">{truncateUrl(reply.url)}</a>
									</span>
								</footer>
							</article>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
{:else if loading}
	<section class="webmentions webmentions--loading">
		<p>Loading webmentions...</p>
	</section>
{/if}

<style>
	.webmentions {
		margin-top: 3em;
		padding-top: 2em;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.webmentions h3 {
		margin-top: 0;
		margin-bottom: 1.5em;
	}

	.webmentions h4 {
		margin-top: 1.5em;
		margin-bottom: 0.75em;
	}

	.webmentions--loading {
		opacity: 0.6;
	}

	.webmentions__list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.webmentions__item {
		margin-bottom: 2em;
	}

	.webmention {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
	}

	.webmention__author {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.webmention__author img,
	.webmention__author .avatar-placeholder {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.2);
		font-size: 1.25em;
		font-weight: bold;
	}

	.webmention__author a {
		color: inherit;
		text-decoration: none;
	}

	.webmention__author a:hover {
		text-decoration: underline;
	}

	.webmention__content {
		margin-left: 56px;
		line-height: 1.5;
	}

	.webmention__content :global(a) {
		color: rgb(150, 150, 255);
	}

	.webmention__meta {
		margin-left: 56px;
		font-size: 0.875em;
		opacity: 0.7;
		display: flex;
		gap: 0.5em;
		flex-wrap: wrap;
	}

	.webmention__meta a {
		color: inherit;
	}

	.webmentions__faces {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.webmentions__faces img,
	.webmentions__faces .avatar-placeholder {
		border-radius: 50%;
		width: 48px;
		height: 48px;
	}

	.webmentions__faces a {
		display: block;
	}

	.webmentions__facepile {
		margin-bottom: 2em;
	}

	.webmention--mention {
		display: inline-flex;
		gap: 0.5em;
		align-items: center;
	}

	.webmention__icon {
		font-size: 1.25em;
	}

	.webmention__text a {
		color: rgb(150, 150, 255);
	}
</style>
