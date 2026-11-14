<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import { COMPOSER_KINDS, type ComposerKind } from '$lib/composer-kinds';
	import { formatAbsoluteDate } from '$lib/utils/formatDate';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import { Button, Heading, Notice, Page, PageHeader, Section } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const published = $derived(page.url.searchParams.get('published'));
	const kinds = Object.entries(COMPOSER_KINDS) as [ComposerKind, (typeof COMPOSER_KINDS)[ComposerKind]][];
	const bookmarklet = $derived(`javascript:(()=>{location.href=${JSON.stringify(`${page.url.origin}/new/bookmark/?url=`)}+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&selection='+encodeURIComponent(String(getSelection()))})()`);
	onMount(() => { if (data.signedIn) rememberOwner(true); });
</script>

<svelte:head><title>New post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main">
	<PageHeader backHref="/account" backText="Account" tight>
		<Heading level={1} size="display">New post</Heading>
	</PageHeader>
	{#if !data.signedIn}
		<OwnerSignIn />
	{:else}
		{#if published}
			<Notice>Posted. <a href={published}>It will appear here</a> after the site rebuilds, usually within a few minutes.{#if page.url.searchParams.has('draft-kept')} The draft could not be removed; discard it below.{/if}</Notice>
		{/if}
		{#if form?.message}<Notice tone={form && 'discarded' in form ? 'info' : 'error'}>{form.message}</Notice>{/if}
		<ul class="kinds">
			{#each kinds as [kind, info] (kind)}
				<li><a href="/new/{kind}/"><strong>{info.label}</strong><span>{info.hint}</span></a></li>
			{/each}
		</ul>

		<Section title="Drafts">
			{#if !data.draftsEnabled}
				<p class="hint">Drafts are not configured. Set <code>PUBLISHING_DRAFTS_GITHUB_REPO</code> and give the publishing token access to that private repository.</p>
			{:else if data.draftsError}
				<Notice tone="error">{data.draftsError}</Notice>
			{:else if !data.drafts.length}
				<p class="hint">No drafts. Use “Save draft” in any editor to keep a post in the private drafts repository.</p>
			{:else}
				<ul class="drafts">
					{#each data.drafts as draft (draft.id)}
						<li>
							<a href="/new/{draft.kind}/?draft={draft.id}">{draft.title}</a>
							<span class="meta">{COMPOSER_KINDS[draft.kind].label} · saved {formatAbsoluteDate(draft.updated)}</span>
							<form method="POST" action="?/discard">
								<input type="hidden" name="csrf" value={data.csrf} />
								<input type="hidden" name="id" value={draft.id} />
								<Button type="submit" size="sm" variant="quiet">Discard</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</Section>

		<Section title="Bookmarklet">
			<p class="hint">Drag this link to your bookmarks bar to bookmark the page you are reading, with any selected text quoted.</p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<p><a class="bookmarklet" href={bookmarklet}>Bookmark on caseyagollan.com</a></p>
		</Section>
	{/if}
</Page>

<style>
	a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
	.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--space-3); margin: var(--space-4) 0; padding: 0; list-style: none; }
	.kinds a { display: flex; flex-direction: column; gap: var(--space-1); height: 100%; box-sizing: border-box; padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text-primary); text-decoration: none; }
	.kinds a:hover, .kinds a:focus-visible { border-color: var(--text-primary); }
	.kinds span, .hint, .meta { color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.drafts { margin: var(--space-3) 0; padding: 0; list-style: none; }
	.drafts li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); }
	.drafts form { margin-left: auto; }
	.bookmarklet { display: inline-block; padding: var(--space-1) var(--space-3); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); }
</style>
