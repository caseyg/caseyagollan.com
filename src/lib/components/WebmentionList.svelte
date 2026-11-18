<script lang="ts">
	import { tick } from 'svelte';
	import { Avatar, Button, Heading, Notice } from '$lib/components/ui';
	import ContextMenu, { type ContextMenuItem } from '$lib/components/ui/ContextMenu.svelte';
	import { authorKey, authorLabel, emptyModeration, groupMentions, type MentionModeration, type ModerationAction } from '$lib/webmentions';
	import type { MentionsMode, ShownMention } from '$lib/webmentions-client';

	interface Props {
		mentions: ShownMention[];
		/** The owner and the preview demo can hide mentions; visitors only read. */
		mode?: MentionsMode;
		/** What the owner has hidden, to word the menu: a hidden person versus one mention. */
		moderation?: MentionModeration;
		/** Starts with hidden mentions and their menus showing, as after pressing Moderate. */
		moderating?: boolean;
		loading?: boolean;
		/** Rejects with a message to show. */
		onModerate?: (change: ModerationAction) => Promise<unknown> | unknown;
	}

	let { mentions, mode = 'visitor', moderation = emptyModeration(), moderating = $bindable(false), loading = false, onModerate }: Props = $props();

	const canModerate = $derived(mode !== 'visitor');
	const showing = $derived(canModerate && moderating ? mentions : mentions.filter((mention) => !mention.hidden));
	const groups = $derived(groupMentions(showing));
	const hiddenCount = $derived(mentions.filter((mention) => mention.hidden).length);
	const any = $derived(showing.length > 0);

	let menu: ContextMenu | undefined = $state();
	let target = $state<ShownMention | null>(null);
	let status = $state<{ tone: 'info' | 'error'; text: string } | null>(null);
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
	const noun = (mention: ShownMention) => (mention.kind === 'like' ? 'favorite' : mention.kind === 'repost' ? 'repost' : mention.kind === 'reply' ? 'reply' : 'mention');

	const items = $derived.by<ContextMenuItem[]>(() => {
		if (!target) return [];
		const person = authorLabel(target);
		const blocked = moderation.blockedAuthors.includes(authorKey(target));
		const items: ContextMenuItem[] = [];
		if (!blocked) {
			items.push(moderation.hidden.includes(target.id)
				? { value: 'show', label: `Show this ${noun(target)}` }
				: { value: 'hide', label: `Hide this ${noun(target)}`, hint: 'Only you will see it' });
		}
		items.push(blocked
			? { value: 'unblock', label: `Show ${person} again`, hint: 'Everything they sent, on every post' }
			: { value: 'block', label: `Hide everything from ${person}`, hint: 'On every post, now and later', destructive: true });
		return items;
	});

	async function openMenu(mention: ShownMention, event: MouseEvent) {
		target = mention;
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		await tick();
		menu?.openAt({ x: box.left, y: box.bottom });
	}

	function say(tone: 'info' | 'error', text: string) {
		clearTimeout(statusTimer);
		status = { tone, text };
		statusTimer = setTimeout(() => (status = null), tone === 'error' ? 6000 : 3000);
	}

	async function onAction(value: string) {
		const mention = target;
		if (!mention || !onModerate) return;
		const person = authorLabel(mention);
		const change: ModerationAction = value === 'hide' || value === 'show' ? { action: value, id: mention.id } : { action: value as 'block' | 'unblock', author: authorKey(mention) };
		const done = { hide: 'Hidden from visitors.', show: 'Showing again.', block: `Everything from ${person} is hidden.`, unblock: `Showing ${person} again.` }[change.action];
		try {
			await onModerate(change);
			say('info', mode === 'demo' ? `${done} Preview only: not saved.` : done);
		} catch (cause) {
			say('error', cause instanceof Error ? cause.message : 'That change wasn’t saved.');
		}
	}
</script>

{#snippet moderate(mention: ShownMention)}
	<Button variant="icon" size="sm" icon="more" label="Moderate {noun(mention)} from {authorLabel(mention)}" onclick={(event: MouseEvent) => openMenu(mention, event)} />
{/snippet}

{#snippet facepile(kind: 'like' | 'repost', icon: string, label: string, people: ShownMention[])}
	<div class="facepile">
		<Heading level={4} size="label"><span aria-hidden="true">{icon}</span> {label}</Heading>
		<ul class="faces">
			{#each people as person (person.id)}
				<li class="{kind === 'like' ? 'p-like' : 'p-repost'} h-cite" class:hidden={person.hidden}>
					{#if canModerate && moderating}
						<button type="button" class="face-button" aria-label="Moderate {noun(person)} from {authorLabel(person)}{person.hidden ? ' (hidden)' : ''}" title={authorLabel(person)} onclick={(event) => openMenu(person, event)}>
							<Avatar src={person.author.photo} name={person.author.name} />
						</button>
					{:else}
						<a class="p-author h-card u-url" href={person.author.url || person.url} target="_blank" rel="noopener" title={authorLabel(person)}>
							<Avatar src={person.author.photo} name={person.author.name} class="u-photo" />
							<data class="p-name" value={person.author.name}></data>
						</a>
					{/if}
					<data class="u-url" value={person.url}></data>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

{#if any || (canModerate && hiddenCount)}
	<section class="webmentions" id="webmentions">
		<header class="webmentions-header">
			<Heading level={3} size="subtitle">Webmentions</Heading>
			{#if canModerate}
				<Button variant="quiet" size="sm" icon="eye-off" pressed={moderating} onclick={() => (moderating = !moderating)}>
					{moderating ? 'Done' : hiddenCount ? `Moderate (${hiddenCount} hidden)` : 'Moderate'}
				</Button>
			{/if}
		</header>

		{#if groups.likes.length}
			{@render facepile('like', '⭐', plural(groups.likes.length, 'favorite'), groups.likes)}
		{/if}

		{#if groups.reposts.length}
			{@render facepile('repost', '🔁', plural(groups.reposts.length, 'repost'), groups.reposts)}
		{/if}

		{#if groups.replies.length || groups.links.length}
			<div class="replies">
				<Heading level={4} size="label"><span aria-hidden="true">💬</span> {plural(groups.replies.length + groups.links.length, 'reply', 'replies')}</Heading>
				<ol class="reply-list">
					{#each groups.replies as reply (reply.id)}
						<li class="p-comment h-cite reply" class:hidden={reply.hidden}>
							<Avatar src={reply.author.photo} name={reply.author.name} class="u-photo" />
							<div class="reply-body">
								<div class="reply-author p-author h-card">
									<a class="p-name u-url" href={reply.author.url || reply.url} target="_blank" rel="noopener">{reply.author.name || authorKey(reply)}</a>
									{#if reply.hidden}<span class="hidden-label">Hidden</span>{/if}
								</div>
								<div class="reply-content p-content">
									{#if reply.html}{@html reply.html}{:else}{reply.text}{/if}
								</div>
								<footer class="reply-meta">
									{#if reply.published}
										<time class="dt-published" datetime={reply.published}>{new Date(reply.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
										<span aria-hidden="true">·</span>
									{/if}
									<a class="u-url" href={reply.url} target="_blank" rel="noopener">{new URL(reply.url).hostname.replace(/^www\./, '')}</a>
								</footer>
							</div>
							{#if canModerate && moderating}{@render moderate(reply)}{/if}
						</li>
					{/each}
					{#each groups.links as link (link.id)}
						<li class="p-comment h-cite mention" class:hidden={link.hidden}>
							<span aria-hidden="true">🔗</span>
							<span class="mention-text">Linked from <a class="u-url" href={link.url} target="_blank" rel="noopener">{link.author.name || new URL(link.url).hostname.replace(/^www\./, '')}</a>{#if link.hidden}<span class="hidden-label">Hidden</span>{/if}</span>
							{#if canModerate && moderating}{@render moderate(link)}{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if canModerate}
			<ContextMenu bind:this={menu} {items} title={target ? authorLabel(target) : undefined} {onAction} />
		{/if}
		{#if status}<Notice tone={status.tone}>{status.text}</Notice>{/if}
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

	.webmentions-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
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

	.faces a,
	.face-button {
		display: block;
		border-radius: var(--radius-full);
		transition: opacity var(--duration) var(--ease);
	}

	.face-button {
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.faces a:hover,
	.face-button:hover {
		opacity: 0.8;
	}

	.face-button:focus-visible {
		outline: 2px solid var(--focus-ring, currentColor);
		outline-offset: 2px;
	}

	.hidden {
		opacity: 0.45;
	}

	.faces .hidden {
		filter: grayscale(1);
	}

	.hidden-label {
		margin-left: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-normal);
	}

	.reply-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.reply {
		display: flex;
		align-items: flex-start;
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
		align-items: center;
		gap: var(--space-2);
		overflow-wrap: anywhere;
	}

	.mention-text {
		flex: 1;
		min-width: 0;
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
