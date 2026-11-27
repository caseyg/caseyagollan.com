<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, MenuChevron, Popover, SubscribePanel, takeSubscribeStatus, type SubscribeOutcome, type SubscribeStatus } from '$lib/components/ui';
	import { SITE_FEEDS, type SiteFeed } from '$lib/feeds';

	interface Props {
		/** Feeds to offer; the site's own by default. */
		feeds?: SiteFeed[];
		/** What the feeds hold when they are not every post, such as "photos" or "#indieweb". */
		scope?: string;
		/** Text on the trigger. */
		label?: string;
		/** Offer the newsletter above the feeds. */
		email?: boolean;
		/** Stand-in for the signup request, for stories. */
		submit?: (email: string) => Promise<SubscribeOutcome>;
		open?: boolean;
	}

	let { feeds = SITE_FEEDS, scope, label = 'Subscribe', email = true, submit, open = $bindable(false) }: Props = $props();

	let initial = $state<SubscribeStatus>();

	// A signup sent without JavaScript comes back as `?subscribe=<status>`: show its answer here.
	onMount(() => {
		initial = takeSubscribeStatus();
		if (initial) open = true;
	});
</script>

<!--
	Pinned beside the page's trail (PageHeader's `pinned`), outlined in the trail's quiet gray so it
	reads as part of the page it subscribes to. A Popover rather than a menu, since it holds a form
	(SubscribePanel). On a phone it shows the feed icon alone.
-->
<Popover label="{label} to {scope ?? 'posts'}" align="start" bind:open triggerClass="feed-menu-trigger" panelClass="feed-menu">
	{#snippet trigger()}<Icon name="rss" size={16} /><span class="label">{label}</span><MenuChevron />{/snippet}
	<SubscribePanel {feeds} {scope} {email} {submit} {initial} />
</Popover>

<style>
	/* The size and outline of the trail beside it (SegmentedPill, md and quiet). */
	:global(.popover-trigger.feed-menu-trigger) {
		box-sizing: border-box;
		height: var(--nav-height);
		--menu-chevron-divider: var(--border);
		padding: 0 0 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	:global(.popover-trigger.feed-menu-trigger:hover),
	:global(.popover-trigger.feed-menu-trigger[data-open]) {
		background: color-mix(in srgb, white 15%, var(--bg-primary));
	}

	:global(.feed-menu) {
		width: min(22rem, calc(100vw - 2rem));
	}

	@media (max-width: 600px) {
		:global(.popover-trigger.feed-menu-trigger) {
			padding-inline: 0.625rem;
		}

		.label,
		:global(.feed-menu-trigger .menu-chevron) {
			display: none;
		}
	}
</style>
