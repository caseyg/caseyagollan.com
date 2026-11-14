<script lang="ts">
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	import { Heading, Page, PageHeader, SegmentedPill } from '$lib/components/ui';

	const missing = $derived(page.status === 404);
	const title = $derived(missing ? 'Nothing at this address' : 'Something went wrong');

	const places = [
		{ label: 'Home', href: '/', icon: '👋' },
		{ label: 'Library', href: '/library/', icon: '📚' },
		{ label: 'Posts', href: '/posts/', icon: '📡' }
	];
</script>

<svelte:head>
	<title>{title} - Casey Gollan</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Nav />

<Page as="main" class="error-page">
	<PageHeader trail={[{ label: 'Casey Gollan', href: '/', icon: '👋' }, { label: String(page.status), href: '', current: true }]} tight>
		<Heading level={1} size="display">{title}</Heading>
	</PageHeader>

	{#if missing}
		<p class="detail">
			There is no page at <span class="path">{page.url.pathname}</span>. It may have moved, or the link may have been mistyped.
		</p>
	{:else}
		<p class="detail">{page.error?.message ?? 'The page could not be shown. Trying again in a moment may help.'}</p>
	{/if}

	<p class="next">Search from the corner, or start from one of these.</p>
	<SegmentedPill segments={places} size="md" label="Sections of the site" />
</Page>

<style>
	.detail,
	.next {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
	}

	.next {
		margin-top: var(--space-6);
		margin-bottom: var(--space-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.path {
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: 0.85em;
		overflow-wrap: anywhere;
	}
</style>
