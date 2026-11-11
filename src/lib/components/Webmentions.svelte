<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Avatar, Heading } from '$lib/components/ui';

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

			const data = await response.json() as { children?: Webmention[] };
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

{#snippet facepile(icon: string, label: string, people: Webmention[])}
	<div class="facepile">
		<Heading level={4} size="label"><span aria-hidden="true">{icon}</span> {label}</Heading>
		<ul class="faces">
			{#each people as person (person['wm-id'])}
				<li>
					<a href={person.author.url} target="_blank" rel="noopener" title={person.author.name}>
						<Avatar src={person.author.photo} name={person.author.name} />
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

{#if !loading && (likes.length > 0 || reposts.length > 0 || replies.length > 0)}
	<section class="webmentions" id="webmentions">
		<Heading level={3} size="subtitle">Webmentions</Heading>

		{#if likes.length > 0}
			{@render facepile('⭐', `${likes.length} favorite${likes.length !== 1 ? 's' : ''}`, likes)}
		{/if}

		{#if reposts.length > 0}
			{@render facepile('🔁', `${reposts.length} repost${reposts.length !== 1 ? 's' : ''}`, reposts)}
		{/if}

		{#if replies.length > 0}
			<div class="replies">
				<Heading level={4} size="label"><span aria-hidden="true">💬</span> {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</Heading>
				<ol class="reply-list">
					{#each replies as reply (reply['wm-id'])}
						<li>
							{#if reply['wm-property'] === 'mention-of' && !reply.content}
								<div class="mention h-cite">
									<span aria-hidden="true">🔗</span>
									<span>mentioned by <a href={reply.url} target="_blank" rel="noopener" class="u-url">{truncateUrl(reply.url)}</a></span>
								</div>
							{:else}
								<article class="reply h-cite">
									<Avatar src={reply.author.photo} name={reply.author.name} class="u-photo" />
									<div class="reply-body">
										<div class="reply-author p-author h-card">
											{#if reply.author.name}
												<a class="p-name u-url" href={reply.author.url} target="_blank" rel="noopener">{reply.author.name}</a>
											{:else if reply.author.url}
												<a class="p-name u-url" href={reply.author.url} target="_blank" rel="noopener">{truncateUrl(reply.author.url, 30)}</a>
											{:else}
												<span class="p-name">Unknown</span>
											{/if}
										</div>
										{#if reply.content}
											<div class="reply-content p-content">
												{#if reply.content.html}
													{@html sanitizeHtml(reply.content.html)}
												{:else if reply.content.text}
													{reply.content.text}
												{:else if reply.content.value}
													{@html sanitizeHtml(reply.content.value)}
												{/if}
											</div>
										{/if}
										<footer class="reply-meta">
											{#if reply.published}
												<time class="dt-published" datetime={reply.published}>{formatDate(reply.published)}</time>
												<span aria-hidden="true">·</span>
											{/if}
											<span>via <a href={reply.url} target="_blank" rel="noopener">{truncateUrl(reply.url)}</a></span>
										</footer>
									</div>
								</article>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/if}
	</section>
{:else if loading}
	<section class="webmentions webmentions--loading" aria-busy="true">
		<p>Loading webmentions…</p>
	</section>
{/if}

<style>
	.webmentions {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	.webmentions--loading {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.webmentions--loading p {
		margin: 0;
	}

	.faces,
	.reply-list {
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.faces {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.faces a {
		display: block;
		border-radius: var(--radius-full);
		transition: opacity var(--duration) var(--ease);
	}

	.faces a:hover {
		opacity: 0.8;
	}

	.reply-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.reply {
		display: flex;
		gap: var(--space-3);
	}

	.reply-body {
		flex: 1;
		min-width: 0;
	}

	.reply-author {
		font-weight: var(--fw-semibold);
		line-height: var(--lh-snug);
	}

	.reply-content {
		margin-top: var(--space-1);
		line-height: var(--lh-normal);
		overflow-wrap: anywhere;
		text-wrap: pretty;
	}

	.reply-content :global(p) {
		margin: 0 0 var(--space-2);
	}

	.reply-meta,
	.mention {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.reply-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
		margin-top: var(--space-2);
		font-size: var(--fs-xs);
	}

	.mention {
		display: flex;
		gap: var(--space-2);
		overflow-wrap: anywhere;
	}

	.webmentions a,
	.reply-content :global(a) {
		color: inherit;
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
	}

	.reply-author a {
		text-decoration: none;
	}

	.reply-author a:hover {
		text-decoration: underline;
	}
</style>
