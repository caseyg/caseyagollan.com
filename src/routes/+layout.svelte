<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import '../app.css';
	import { page } from '$app/state';
	import { SITE_FEEDS, SITE_URL, type ScopedFeeds } from '$lib/feeds';
	import { SITE_IDENTITY } from '$lib/identity';
	import { OPENSEARCH_PATH, OPENSEARCH_TITLE } from '$lib/opensearch';
	import WikiPreviews from '$lib/components/wiki/WikiPreviews.svelte';
	import { onMount } from 'svelte';
	import { ownerSignedIn } from '$lib/owner';
	import { CHAT_OWNER_ONLY, type ChatViewer } from '$lib/chat';

	let { children } = $props();

	// A type or tag page names its own feeds first, so a reader given the page picks those.
	const scoped = $derived(page.data.feeds as ScopedFeeds | undefined);

	// Casey's chat follows them around the site. Visitors never load it: chat is owner-only for now.
	let chatViewer = $state<ChatViewer | null>(null);
	onMount(() => {
		void (async () => {
			if (CHAT_OWNER_ONLY && !(await ownerSignedIn())) return;
			const response = await fetch('/api/chat', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
			if (response?.ok) chatViewer = ((await response.json()) as { viewer: ChatViewer }).viewer;
		})();
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="128x128" href={favicon} />
	{#if scoped}
		{#each scoped.feeds as feed (feed.path)}
			<link rel="alternate" type={feed.mime} title="Casey Gollan: {scoped.title} ({feed.label})" href="{SITE_URL}{feed.path}" />
		{/each}
	{/if}
	{#each SITE_FEEDS as feed (feed.path)}
		<link rel="alternate" type={feed.mime} title="Casey Gollan {feed.label}" href="{SITE_URL}{feed.path}" />
	{/each}
	<!-- Lets a browser add site search as a search engine. -->
	<link rel="search" type="application/opensearchdescription+xml" title={OPENSEARCH_TITLE} href="{SITE_URL}{OPENSEARCH_PATH}" />
	<!-- IndieAuth -->
	<link rel="authorization_endpoint" href={new URL('/auth', __INDIEAUTH_ISSUER__).href} />
	<link rel="token_endpoint" href={new URL('/auth/token', __INDIEAUTH_ISSUER__).href} />
	<link rel="indieauth-metadata" href={new URL('/.well-known/oauth-authorization-server', __INDIEAUTH_ISSUER__).href} />
	<link rel="micropub" href={__MICROPUB_ENDPOINT__} />
	{#each SITE_IDENTITY.profiles as profile (profile.href)}
		<link rel="me" href={profile.href} />
	{/each}
	<!-- Webmention -->
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
	<link rel="pingback" href="https://webmention.io/caseyagollan.com/xmlrpc" />
</svelte:head>

{@render children?.()}

<!-- Hovering a link to a wiki page, anywhere on the site, previews it. -->
<WikiPreviews />

{#if chatViewer}
	{#await import('$lib/components/chat/SiteChat.svelte') then { default: SiteChat }}
		<SiteChat viewer={chatViewer} />
	{/await}
{/if}
