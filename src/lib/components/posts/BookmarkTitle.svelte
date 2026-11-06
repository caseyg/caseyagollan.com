<script lang="ts">
	let { url, title }: { url: string; title?: string } = $props();
</script>

<a href={url} class="u-bookmark-of">🔗 {title || url.replace(/^https?:\/\//, '')}</a>

<style>
	a {
		color: inherit;
		text-decoration: none;
		text-underline-offset: 0.15em;
		overflow-wrap: anywhere;
	}
	a:hover {
		text-decoration: underline;
	}
</style>
