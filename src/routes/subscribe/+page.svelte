<script lang="ts">
	import { onMount } from 'svelte';
	import Nav from '$lib/components/Nav.svelte';
	import { PostsLayout } from '$lib/components/posts';
	import { PageHeader, SubscribePanel, takeSubscribeStatus, type SubscribeStatus } from '$lib/components/ui';
	import { postsCrumb, SUBSCRIBE_CRUMB } from '$lib/components/posts/trail';

	let initial = $state<SubscribeStatus>();
	onMount(() => (initial = takeSubscribeStatus()));
</script>

<svelte:head>
	<title>Subscribe - Casey Gollan</title>
	<meta name="description" content="Get new posts by Casey Gollan by email, RSS, Atom or JSON Feed" />
	<meta property="og:title" content="Subscribe - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<!-- Where a post's subscribe line links in feeds and email: every way to follow, on its own page. -->
<PostsLayout>
	<PageHeader trail={[postsCrumb(), { ...SUBSCRIBE_CRUMB, current: true }]} title="Subscribe" />
	<SubscribePanel {initial} />
</PostsLayout>
