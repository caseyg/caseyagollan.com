<script lang="ts">
	import { SITE_FEEDS, SITE_URL, type SiteFeed } from '$lib/feeds';
	import Icon from './Icon.svelte';
	import SubscribeForm, { type SubscribeOutcome } from './SubscribeForm.svelte';
	import type { SubscribeStatus } from './subscribeStatus';

	interface Props {
		/** Feeds to offer; the site's own by default. */
		feeds?: SiteFeed[];
		/** Offer the newsletter above the feeds. */
		email?: boolean;
		label?: string;
		buttonLabel?: string;
		/** The answer to a signup sent without JavaScript. */
		initial?: SubscribeStatus;
		/** Stand-in for the signup request, for stories and tests. */
		submit?: (email: string) => Promise<SubscribeOutcome>;
	}

	let { feeds = SITE_FEEDS, email = true, label = 'Get new posts by email', buttonLabel = 'Sign up', initial, submit }: Props = $props();

	const host = new URL(SITE_URL).host;
</script>

<!--
	Every way to follow the site: email first, then the feeds. The Subscribe menu on /posts, the
	/subscribe page and a subscribe line in a post all show this. Feed addresses are files, so each
	loads in full rather than through the client router.
-->
<div class="subscribe-panel">
	{#if email}
		<div class="email">
			{#key initial}<SubscribeForm {label} {buttonLabel} {submit} {initial} />{/key}
		</div>
		<p class="or">Or follow with a feed reader</p>
	{/if}
	<ul class="feeds">
		{#each feeds as feed (feed.path)}
			<li>
				<a href={feed.path} title="{feed.label} feed" data-sveltekit-reload>
					<Icon name={feed.icon} size={18} />
					<span class="label">{feed.label}<span class="detail">{host}{feed.path}</span></span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	/* Selectors start at the panel so it keeps its spacing inside Prose, whose p, ul and a rules are as specific. */
	.subscribe-panel {
		min-width: 0;
	}

	.subscribe-panel .email {
		padding: var(--space-2) var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	.subscribe-panel .or {
		margin: var(--space-3) var(--space-2) var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.subscribe-panel .feeds {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.subscribe-panel .feeds li {
		margin: 0;
	}

	.subscribe-panel .feeds a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	.subscribe-panel .feeds a:focus-visible {
		background: var(--surface-2);
	}

	@media (hover: hover) {
		.subscribe-panel .feeds a:hover {
			background: var(--surface-2);
		}
	}

	.subscribe-panel .label {
		flex: 1;
		min-width: 0;
	}

	.subscribe-panel .detail {
		display: block;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
	}
</style>
