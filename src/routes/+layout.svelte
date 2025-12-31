<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- IndieAuth -->
	<link rel="authorization_endpoint" href="https://kit.caseyagollan.com/auth" />
	<link rel="token_endpoint" href="https://kit.caseyagollan.com/auth/token" />
	<link rel="indieauth-metadata" href="https://kit.caseyagollan.com/.well-known/oauth-authorization-server" />
	<link rel="micropub" href="https://kit.caseyagollan.com/micropub" />
	<link rel="me" href="https://social.coop/@caseyg" />
	<!-- Webmention -->
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
	<link rel="pingback" href="https://webmention.io/caseyagollan.com/xmlrpc" />
</svelte:head>

{@render children?.()}
