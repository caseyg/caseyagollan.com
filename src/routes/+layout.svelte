<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
	<link rel="pingback" href="https://webmention.io/caseyagollan.com/xmlrpc" />
</svelte:head>

{@render children?.()}
