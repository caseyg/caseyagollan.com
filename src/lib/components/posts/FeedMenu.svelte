<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, Popover, SubscribeForm, type SubscribeOutcome } from '$lib/components/ui';
	import { SITE_FEEDS, SITE_URL, type SiteFeed } from '$lib/feeds';

	interface Props {
		/** Feeds to offer; the site's own by default. */
		feeds?: SiteFeed[];
		/** Text on the trigger. */
		label?: string;
		/** Offer the newsletter above the feeds. */
		email?: boolean;
		/** Stand-in for the signup request, for stories. */
		submit?: (email: string) => Promise<SubscribeOutcome>;
		open?: boolean;
	}

	let { feeds = SITE_FEEDS, label = 'Subscribe', email = true, submit, open = $bindable(false) }: Props = $props();

	const host = new URL(SITE_URL).host;
	const STATUSES = ['subscribed', 'confirmed', 'already', 'invalid', 'unavailable', 'failed'] as const;
	let initial = $state<SubscribeOutcome['status'] | 'confirmed'>();

	// A signup sent without JavaScript comes back as `?subscribe=<status>`: show its answer here.
	onMount(() => {
		const url = new URL(location.href);
		const status = url.searchParams.get('subscribe') as (typeof STATUSES)[number] | null;
		if (!status || !STATUSES.includes(status)) return;
		initial = status;
		open = true;
		url.searchParams.delete('subscribe');
		history.replaceState(history.state, '', url);
	});
</script>

<!--
	The gray control of the feed it offers, like the date pills and filters. A Popover rather than a
	menu, since it holds a form. Feed addresses are files, so each loads in full rather than through
	the client router.
-->
<Popover label="{label} to posts" align="end" bind:open triggerClass="feed-menu-trigger" panelClass="feed-menu">
	{#snippet trigger()}<Icon name="rss" size={16} /><span>{label}</span><span class="arrow" aria-hidden="true">▾</span>{/snippet}
	{#if email}
		<div class="email">
			{#key initial}<SubscribeForm label="Get new posts by email" buttonLabel="Sign up" {submit} {initial} />{/key}
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
</Popover>

<style>
	:global(.feed-menu-trigger) {
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
	}

	.arrow {
		font-size: var(--fs-sm);
		transition: transform var(--duration) var(--ease);
	}

	:global(.feed-menu-trigger[data-open]) .arrow {
		transform: rotate(180deg);
	}

	:global(.feed-menu) {
		width: min(22rem, calc(100vw - 2rem));
	}

	.email {
		padding: var(--space-2) var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	.or {
		margin: var(--space-3) var(--space-2) var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.feeds {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.feeds a {
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

	.feeds a:focus-visible {
		background: var(--surface-2);
	}

	@media (hover: hover) {
		.feeds a:hover {
			background: var(--surface-2);
		}
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

	@media (prefers-reduced-motion: reduce) {
		.arrow {
			transition: none;
		}
	}
</style>
