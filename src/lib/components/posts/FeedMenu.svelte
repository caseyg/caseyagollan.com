<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, Popover, SubscribePanel, takeSubscribeStatus, type SubscribeOutcome, type SubscribeStatus } from '$lib/components/ui';
	import { SITE_FEEDS, type SiteFeed } from '$lib/feeds';

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

	let initial = $state<SubscribeStatus>();

	// A signup sent without JavaScript comes back as `?subscribe=<status>`: show its answer here.
	onMount(() => {
		initial = takeSubscribeStatus();
		if (initial) open = true;
	});
</script>

<!--
	The gray control of the feed it offers, like the date pills and filters. A Popover rather than a
	menu, since it holds a form (SubscribePanel).
-->
<Popover label="{label} to posts" align="end" bind:open triggerClass="feed-menu-trigger" panelClass="feed-menu">
	{#snippet trigger()}<Icon name="rss" size={16} /><span>{label}</span><span class="arrow" aria-hidden="true">▾</span>{/snippet}
	<SubscribePanel {feeds} {email} {submit} {initial} />
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

	@media (prefers-reduced-motion: reduce) {
		.arrow {
			transition: none;
		}
	}
</style>
