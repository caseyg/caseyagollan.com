<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import ComposerBar from '$lib/components/composer/ComposerBar.svelte';
	import ComposerButton from '$lib/components/composer/ComposerButton.svelte';
	import { Heading, Notice, Page, PageHeader } from '$lib/components/ui';
	import PostEditor from './PostEditor.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Absolute, so links work whether or not the address ends in a slash.
	const base = $derived(`/${page.params.year}/${page.params.month}/${page.params.day}/${encodeURIComponent(page.params.slug ?? '')}/`);
	onMount(() => {
		if (!data.signedIn) return;
		rememberOwner(true);
		// Fetch the rich editor while the post is still loading.
		void import('$lib/components/MarkdownEditor.svelte').catch(() => undefined);
		void import('$lib/markdown-editor').catch(() => undefined);
	});
</script>

<svelte:head><title>Edit post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main" class="compose-page">
	{#if !data.signedIn}
		<PageHeader backHref={base} backText="Original post" tight><Heading level={1} size="display">Edit post</Heading></PageHeader>
		<OwnerSignIn message="Sign in to edit this post." />
	{:else}
		{#await data.editor}
			<ComposerBar>
				<ComposerButton variant="icon" icon="close" label="Back to the post" href={base} />
				<span class="kind">Edit post</span>
				{#snippet actions()}<ComposerButton variant="primary" disabled>Save</ComposerButton>{/snippet}
			</ComposerBar>
			<div class="skeleton" role="status" aria-live="polite">
				<span class="visually-hidden">Loading the post from GitHub…</span>
				<div class="bar"></div>
				<div class="line title"></div>
				<div class="line label"></div>
				{#each [62, 48, 74] as width (width)}<div class="row"><div class="line key"></div><div class="line" style:width="{width}%"></div></div>{/each}
				<div class="line body"></div>
				<div class="line body" style:width="88%"></div>
				<div class="line body" style:width="54%"></div>
			</div>
		{:then editor}
			{#if !('revision' in editor)}
				<ComposerBar>
					<ComposerButton variant="icon" icon="close" label="Back to the post" href={base} />
					<span class="kind">Edit post</span>
				</ComposerBar>
				<Notice tone="error">{editor.error}</Notice>
			{:else}
				<PostEditor {editor} csrf={data.csrf} form={form as never} {base} />
			{/if}
		{/await}
	{/if}
</Page>

<style>
	:global(.compose-page) { max-width: 40rem; }
	.kind { padding: var(--space-1) var(--space-2); color: var(--text-primary); font-size: var(--fs-sm); font-weight: var(--fw-medium); }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.skeleton { position: relative; display: flex; flex-direction: column; gap: var(--space-3); }
	.bar { position: absolute; top: calc(-1 * var(--space-3)); left: 0; height: 2px; width: 30%; border-radius: var(--radius-full); background: var(--text-primary); animation: progress 1.4s var(--ease) infinite; }
	.line { height: 0.9rem; width: 100%; border-radius: var(--radius-sm); background: var(--surface-2); animation: pulse 1.4s ease-in-out infinite; }
	.title { height: 2rem; width: 55%; }
	.label { width: 6rem; height: 0.7rem; margin-top: var(--space-2); }
	.row { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr; gap: var(--space-2); }
	.key { width: 70%; }
	.body { height: 1.1rem; }
	.line.body:first-of-type { margin-top: var(--space-4); }
	@keyframes pulse { 50% { opacity: 0.45; } }
	@keyframes progress { from { left: 0; width: 10%; } 50% { width: 35%; } to { left: 100%; width: 10%; } }
	@media (prefers-reduced-motion: reduce) { .line, .bar { animation: none; } }
</style>
