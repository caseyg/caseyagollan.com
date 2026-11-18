<script lang="ts">
	import { SelectMenu, type MenuOption } from '$lib/components/ui';
	import { SITE_FEEDS, SITE_URL, type SiteFeed } from '$lib/feeds';

	interface Props {
		/** Feeds to offer; the site's own by default. */
		feeds?: SiteFeed[];
		/** Text on the trigger. */
		label?: string;
	}

	let { feeds = SITE_FEEDS, label = 'Subscribe' }: Props = $props();

	const host = new URL(SITE_URL).host;
	const options: MenuOption[] = $derived(
		feeds.map((feed) => ({ value: feed.path, label: feed.label, href: feed.path, iconName: feed.icon, detail: `${host}${feed.path}`, title: `${feed.label} feed` }))
	);
</script>

<!--
	The gray control of the feed it offers, like the date pills and filters. Feed addresses are files,
	so each option loads in full rather than through the client router.
-->
<SelectMenu variant="quiet" current={label} currentIconName="rss" label="{label} to posts by feed" {options} active="" align="end" reload />
