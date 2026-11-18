<script module lang="ts">
	const SERVER_KEY = 'respond:mastodon-server';

	/** The visitor's server, remembered in this browser only. */
	function rememberedServer(): string {
		try {
			return localStorage.getItem(SERVER_KEY) ?? '';
		} catch {
			return '';
		}
	}

	function rememberServer(server: string) {
		try {
			localStorage.setItem(SERVER_KEY, server);
		} catch {
			/* private windows: ask again next time */
		}
	}
</script>

<script lang="ts">
	import { Button, Icon } from '$lib/components/ui';
	import InlineForm from '$lib/components/ui/InlineForm.svelte';
	import {
		HOME_SERVER,
		WEBMENTION_ENDPOINT,
		WEB_PROPERTY,
		blueskyComposeUrl,
		mastodonInteractUrl,
		mastodonShareUrl,
		normalizeServer,
		sendWebmention,
		xIntentUrl,
		type PostCopies,
		type RespondAction,
		type WebmentionOutcome
	} from '$lib/respond';

	type View = 'list' | 'mastodon' | 'web';

	interface Props {
		action: RespondAction;
		/** The post's canonical address, which a Webmention names as its target. */
		url: string;
		title?: string;
		copies?: PostCopies;
		/** Starts on a step, for stories. */
		view?: View;
		/** Called after a link opens elsewhere, so the menu can close. */
		onDone?: () => void;
		/** Stand-ins for stories and tests. */
		send?: (source: string, target: string) => Promise<WebmentionOutcome>;
		openUrl?: (url: string) => void;
	}

	let { action, url, title = '', copies = {}, view = $bindable('list'), onDone, send, openUrl }: Props = $props();

	const VERB = { reply: 'Reply', like: 'Like', repost: 'Repost' } as const;
	const NOUN = { reply: 'reply', like: 'like', repost: 'repost' } as const;
	const verb = $derived(VERB[action]);
	const shareText = $derived(title ? `${title} ${url}` : url);

	interface Choice {
		key: string;
		mark: string;
		label: string;
		detail: string;
		href?: string;
		step?: View;
	}

	// Liking needs a copy to like; replying and reposting can start a new post that links here instead.
	const choices = $derived.by<Choice[]>(() => {
		const list: Choice[] = [];
		if (copies.bluesky) list.push({ key: 'bluesky', mark: '🦋', label: `${verb} on Bluesky`, detail: 'Opens the post on bsky.app', href: copies.bluesky });
		else if (action !== 'like') list.push({ key: 'bluesky', mark: '🦋', label: 'Post on Bluesky', detail: 'Starts a post with a link here', href: blueskyComposeUrl(shareText) });
		if (copies.mastodon) list.push({ key: 'mastodon', mark: '🐘', label: `${verb} on Mastodon`, detail: 'From your own server', step: 'mastodon' });
		else if (action !== 'like') list.push({ key: 'mastodon', mark: '🐘', label: 'Post on Mastodon', detail: 'Starts a post on your server', step: 'mastodon' });
		if (copies.x || action !== 'like') list.push({ key: 'x', mark: '𝕏', label: copies.x ? `${verb} on X` : 'Post on X', detail: copies.x ? 'Opens X' : 'Starts a post with a link here', href: xIntentUrl(action, url, title, copies.x) });
		list.push({ key: 'web', mark: '🌐', label: 'From your website', detail: 'Send a Webmention', step: 'web' });
		return list;
	});

	// --- Mastodon: which server? ---
	let server = $state(rememberedServer());
	let serverError = $state('');

	function open(href: string) {
		if (openUrl) openUrl(href);
		else window.open(href, '_blank', 'noopener');
		onDone?.();
	}

	function goToServer(value: string) {
		const host = normalizeServer(value);
		if (!host) {
			serverError = 'Type your server’s address, such as mastodon.social, or your handle.';
			return;
		}
		rememberServer(host);
		server = host;
		open(copies.mastodon ? mastodonInteractUrl(host, copies.mastodon) : mastodonShareUrl(host, shareText));
	}

	// --- Webmention from the visitor's site ---
	let source = $state('');
	let sending = $state(false);
	let sendError = $state('');
	let sent = $state(false);

	async function sendMention(value: string) {
		sending = true;
		const outcome = await (send ? send(value, url) : sendWebmention(value, url));
		sending = false;
		if (outcome.ok) sent = true;
		else sendError = outcome.message;
	}

	function back() {
		view = 'list';
		serverError = sendError = '';
		sent = false;
	}
</script>

<div class="respond-panel">
	{#if view === 'list'}
		<ul class="choices">
			{#each choices as choice (choice.key)}
				<li>
					{#if choice.href}
						<a class="choice" href={choice.href} target="_blank" rel="noopener">
							<span class="mark" aria-hidden="true">{choice.mark}</span>
							<span class="label">{choice.label}<span class="detail">{choice.detail}</span></span>
						</a>
					{:else}
						<button type="button" class="choice" onclick={() => (view = choice.step ?? 'list')}>
							<span class="mark" aria-hidden="true">{choice.mark}</span>
							<span class="label">{choice.label}<span class="detail">{choice.detail}</span></span>
							<span class="next" aria-hidden="true"><Icon name="chevron" size={16} /></span>
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="note">{action === 'reply' ? 'Replies' : action === 'like' ? 'Likes' : 'Reposts'} show up under the post.</p>
	{:else}
		<div class="step">
			<Button variant="quiet" size="sm" class="back" onclick={back}>← Back</Button>
			{#if view === 'mastodon'}
				<InlineForm
					label="Your Mastodon server"
					name="server"
					placeholder="mastodon.social"
					inputmode="url"
					autocomplete="url"
					buttonLabel="Go"
					bind:value={server}
					bind:error={serverError}
					hint={copies.mastodon ? `Opens the post there, signed in, to ${NOUN[action]}.` : 'Opens a new post there with a link here.'}
					onsubmit={goToServer}
				/>
				{#if copies.mastodon}
					<p class="note">No account? <a href={copies.mastodon} target="_blank" rel="noopener" onclick={() => onDone?.()}>See it on {HOME_SERVER}</a></p>
				{/if}
			{:else if sent}
				<div class="sent" role="status">
					<Icon name="status" size={18} />
					<p><strong>Thanks!</strong> Your {NOUN[action]} will show up here once it’s been checked.</p>
				</div>
			{:else}
				<p class="how">
					Post on your site with a <code>{WEB_PROPERTY[action]}</code> link to this page. If your site doesn’t send Webmentions itself, paste your post’s address here.
				</p>
				<InlineForm
					label="Your post’s address"
					name="source"
					type="url"
					inputmode="url"
					placeholder="https://"
					buttonLabel="Send"
					busyLabel="Sending…"
					busy={sending}
					bind:value={source}
					bind:error={sendError}
					action={WEBMENTION_ENDPOINT}
					target="_blank"
					hidden={{ target: url }}
					onsubmit={sendMention}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.respond-panel {
		width: min(20rem, calc(100vw - 2rem));
	}

	.choices {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.choices li {
		margin: 0;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	.choice:focus-visible {
		outline: none;
		background: var(--surface-2);
	}

	@media (hover: hover) {
		.choice:hover {
			background: var(--surface-2);
		}
	}

	.mark {
		width: 1.25rem;
		text-align: center;
		font-size: var(--fs-base);
	}

	.label {
		flex: 1;
		min-width: 0;
	}

	.detail {
		display: block;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
	}

	.next {
		display: flex;
		color: var(--text-muted);
		rotate: -90deg;
	}

	.note,
	.how {
		margin: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}

	.how {
		margin: var(--space-1) 0 var(--space-3);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		text-wrap: pretty;
	}

	.note a {
		color: var(--text-secondary);
		text-underline-offset: var(--underline-offset);
	}

	.step {
		padding: var(--space-1) var(--space-2) var(--space-2);
	}

	.step .note {
		margin: var(--space-3) 0 0;
	}

	.step :global(.back) {
		margin: 0 0 var(--space-2) calc(-1 * var(--space-2));
	}

	.sent {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.sent p {
		margin: 0;
	}

	code {
		font-size: 0.9em;
	}
</style>
