<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="128x128" href={favicon} />
	<link rel="alternate" type="application/rss+xml" title="Casey Gollan RSS" href="https://caseyagollan.com/feed.xml" />
	<link rel="alternate" type="application/atom+xml" title="Casey Gollan Atom" href="https://caseyagollan.com/atom.xml" />
	<link rel="alternate" type="application/feed+json" title="Casey Gollan JSON Feed" href="https://caseyagollan.com/feed.json" />
	<!-- IndieAuth -->
	<link rel="authorization_endpoint" href={new URL('/auth', __INDIEAUTH_ISSUER__).href} />
	<link rel="token_endpoint" href={new URL('/auth/token', __INDIEAUTH_ISSUER__).href} />
	<link rel="indieauth-metadata" href={new URL('/.well-known/oauth-authorization-server', __INDIEAUTH_ISSUER__).href} />
	<link rel="micropub" href={__MICROPUB_ENDPOINT__} />
	<link rel="me" href="https://social.coop/@caseyg" />
	<!-- Webmention -->
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
	<link rel="pingback" href="https://webmention.io/caseyagollan.com/xmlrpc" />
</svelte:head>

{@render children?.()}
