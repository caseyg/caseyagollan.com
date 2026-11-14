<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import { passkeyError, signInWithPasskey } from '$lib/passkey-login';
	import { rememberOwner } from '$lib/owner';
	import { formatAbsoluteDate } from '$lib/utils/formatDate';
	import { Button, Heading, Notice, Page, PageHeader, TextField } from '$lib/components/ui';
	import type { PageData, ActionData } from './$types';
	import type { EditorFields } from '$lib/server/publishing/post-editor';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const urlLabels: Record<string, string> = { 'in-reply-to': 'Reply To (a URL you are replying to)', 'bookmark-of': 'Bookmark URL', 'like-of': 'Like of', 'repost-of': 'Repost of' };
	// A failed save keeps what was typed; otherwise show the stored post.
	const fields = $derived<EditorFields | undefined>((form && 'fields' in form ? form.fields as EditorFields : undefined) ?? (data.signedIn ? data.fields : undefined));
	const reaction = $derived(!!fields && ('like-of' in fields.urls || 'repost-of' in fields.urls));
	// Native saves reload the page, so these start from the stored post each time.
	let content = $state(untrack(() => fields?.content ?? ''));
	let format = $state(untrack(() => fields?.format ?? 'markdown'));
	// The textarea stays the form field; the rich editor is a view over it, loaded in the browser only.
	let Editor = $state<typeof import('$lib/components/MarkdownEditor.svelte').default>();
	let source = $state(false);
	// Set when the rich editor would rewrite Markdown it cannot represent exactly.
	let lossy = $state(false);
	const rich = $derived(!!Editor && format === 'markdown' && !source);
	let saving = $state(false);
	let signingIn = $state(false);
	let signInError = $state('');
	let passkeysSupported = $state(false);
	let ready = $state(false);
	onMount(() => {
		passkeysSupported = browserSupportsWebAuthn(); ready = true; rememberOwner(data.signedIn);
		if (data.signedIn) void Promise.all([import('$lib/components/MarkdownEditor.svelte'), import('$lib/markdown-editor')]).then(([module, markdown]) => {
			lossy = format === 'markdown' && !markdown.roundTrips(content);
			source = lossy;
			Editor = module.default;
		}).catch(() => { /* The Markdown textarea remains usable. */ });
	});
	async function login() {
		if (signingIn) return;
		signingIn = true; signInError = '';
		try {
			await signInWithPasskey();
			window.location.replace(page.url.pathname + page.url.search + page.url.hash);
		} catch (cause) { signInError = passkeyError(cause); }
		finally { signingIn = false; }
	}
</script>

<svelte:head><title>Edit post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main">
	<PageHeader backHref="../" backText="Original post" tight>
		<Heading level={1} size="display">Edit post</Heading>
	</PageHeader>
	{#if !data.signedIn || !fields}
		<p>Sign in to edit this post.</p>
		{#if signInError}<Notice tone="error">{signInError}</Notice>{/if}
		{#if ready && !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in.</Notice>{/if}
		<Button variant="primary" disabled={signingIn || !passkeysSupported} onclick={login}>{signingIn ? 'Signing in…' : 'Sign in with passkey'}</Button>
		<noscript><p>Enable JavaScript to sign in with your passkey.</p></noscript>
	{:else}
		{#if form?.message}<Notice tone={form && 'saved' in form ? 'info' : 'error'}>{form.message}</Notice>{/if}
		<form method="POST" onsubmit={() => { saving = true; }}>
			<input type="hidden" name="csrf" value={data.csrf} />
			<input type="hidden" name="revision" value={data.revision} />
			{#each Object.entries(fields.urls) as [key, value] (key)}
				<TextField label={urlLabels[key]} name={key} type="url" {value} required autocomplete="off" spellcheck="false" />
			{/each}
			{#if fields.name !== undefined || (!reaction && !('in-reply-to' in fields.urls))}<TextField label="Title" name="name" value={fields.name ?? ''} autocomplete="off" />{/if}
			{#if fields.summary !== undefined || (fields.name && !('bookmark-of' in fields.urls))}<TextField multiline label="Summary" name="summary" rows={3} value={fields.summary ?? ''} />{/if}
			{#if Editor && format === 'markdown'}
				<div class="modes" role="group" aria-label="Content editor">
					<button type="button" aria-pressed={!source} onclick={() => { source = false; }}>Rich text</button>
					<button type="button" aria-pressed={source} onclick={() => { source = true; }}>Markdown</button>
				</div>
			{/if}
			{#if lossy && Editor && format === 'markdown'}<p class="hint">This post uses Markdown the rich text editor would rewrite, so it opened as source. Editing it as rich text may change formatting you did not touch.</p>{/if}
			{#if rich && Editor}
				<div class="rich">
					<span class="label">Content</span>
					<Editor bind:value={content} label="Content" />
				</div>
			{/if}
			<div hidden={rich}>
				<TextField multiline mono={format !== 'text'} label="Content" name="content" rows={reaction ? 4 : 16} bind:value={content} />
			</div>
			<div class="row">
				<label class="select">Content Type
					<select name="format" bind:value={format}>
						<option value="text">Text</option>
						<option value="markdown">Markdown</option>
						<option value="html">HTML</option>
					</select>
				</label>
				<label class="select">Status
					<select name="status" value={fields.status}>
						<option value="published">Published</option>
						<option value="draft">Draft</option>
					</select>
				</label>
			</div>
			<TextField label="Tags" name="category" value={fields.category} placeholder="e.g. web, personal" autocomplete="off" autocapitalize="off" />
			<p class="hint">
				Published {data.published ? formatAbsoluteDate(data.published) : 'date unknown'}. The date and address of a post stay fixed.
				{#if data.photos}{data.photos} attached {data.photos === 1 ? 'photo stays' : 'photos stay'} as {data.photos === 1 ? 'it is' : 'they are'}.{/if}
				Drafts leave the public site, but their source remains visible in the content repository.
			</p>
			<div class="actions">
				<Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
				<Button href="../" variant="quiet">Cancel</Button>
				{#if !reaction}<Button href="../syndicate/" variant="quiet">Syndicate…</Button>{/if}
			</div>
		</form>
	{/if}
</Page>

<style>
	.modes { display: flex; justify-content: flex-end; gap: var(--space-1); margin: var(--space-3) 0 calc(-1 * var(--space-3)); }
	.modes button { padding: var(--space-1) var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
	.modes button[aria-pressed='true'] { background: var(--surface-2); color: var(--text-primary); }
	.rich { display: flex; flex-direction: column; gap: var(--space-1); margin: var(--space-3) 0; }
	.label { color: var(--text-secondary); font-size: var(--fs-sm); line-height: var(--lh-snug); }
	.row { display: flex; flex-wrap: wrap; gap: var(--space-4); }
	.select { display: flex; flex-direction: column; gap: var(--space-1); flex: 1 1 10rem; margin: var(--space-3) 0; color: var(--text-secondary); font-size: var(--fs-sm); line-height: var(--lh-snug); }
	select { box-sizing: border-box; width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface-sunken); color: var(--text-primary); font: inherit; font-size: var(--fs-base); line-height: var(--lh-normal); }
	select:hover, select:focus { border-color: var(--text-primary); }
	.hint { max-width: 40rem; margin: var(--space-2) 0 var(--space-4); color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); }
</style>
