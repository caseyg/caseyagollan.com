<script lang="ts">
	import { wikiHref } from '$lib/wiki/links';

	let { url, title }: { url: string; title?: string } = $props();
</script>

<!-- A bookmarked cag.wiki page opens in the wiki browser. -->
<a href={wikiHref(url) ?? url} class="u-bookmark-of"><span class="icon" aria-hidden="true">🔗</span>{title || url.replace(/^https?:\/\//, '')}</a>

<style>
	a {
		color: inherit;
		text-decoration: none;
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
		overflow-wrap: anywhere;
	}

	a:hover {
		text-decoration: underline;
	}

	.icon {
		margin-right: 0.35em;
		font-size: 0.85em;
	}
</style>
