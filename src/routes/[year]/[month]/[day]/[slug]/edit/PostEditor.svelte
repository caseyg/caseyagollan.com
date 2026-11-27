<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
	import { COMPOSER_KINDS } from '$lib/composer-kinds';
	import { POST_TYPE_PLURALS } from '$lib/posts-types';
	import ComposerBar from '$lib/components/composer/ComposerBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ComposerToolbar from '$lib/components/composer/ComposerToolbar.svelte';
	import FrontmatterProperties from '$lib/components/editor/FrontmatterProperties.svelte';
	import AttachedPhotos from '$lib/components/editor/AttachedPhotos.svelte';
	import { Notice } from '$lib/components/ui';
	import type { EditorFields, EditorSource } from '$lib/server/publishing/post-editor';

	interface Props {
		/** `pull` is set when the post is read from a pull request's branch in the content repository. */
		editor: EditorSource & { github?: string; pull?: { number: number; title: string; url: string } };
		csrf: string;
		/** The result of a failed or successful save. */
		form?: { message?: string; saved?: boolean; fields?: EditorFields } | null;
		/** The post's own address, such as /2026/11/14/slug/. */
		base: string;
		/** Set when the last save moved the post here from another slug. */
		moved?: boolean;
		/** The pull request the last Publish merged. */
		merged?: number;
	}
	let { editor, csrf, form, base, moved = false, merged }: Props = $props();
	// A stored draft, or any post still on a pull request, is published from here.
	const unpublished = $derived(editor.fields.status === 'draft' || !!editor.pull);
	const savedSlug = $derived(decodeURIComponent(base.split('/')[4] ?? ''));

	// Content folders, named and drawn as in the composer's post-type menu.
	const KINDS: Record<string, [string, IconName]> = {
		...Object.fromEntries(Object.entries(COMPOSER_KINDS).map(([kind, details]) => [POST_TYPE_PLURALS[kind], [details.label.toLowerCase(), details.icon]])),
		media: ['post', 'image']
	};
	// A failed save keeps what was typed; otherwise show the stored post.
	const initial = untrack(() => form?.fields ?? editor.fields);
	const [kindLabel, kindIcon] = $derived<[string, IconName]>((editor.path ? KINDS[editor.path.split('/')[0]] : undefined) ?? ['post', 'note']);
	const reaction = $derived(!!initial.properties && ('like-of' in initial.properties || 'repost-of' in initial.properties));
	// Native saves reload the page, so these start from the stored post each time.
	let name = $state(untrack(() => initial.name ?? ''));
	let content = $state(untrack(() => initial.content));
	let format = $state(untrack(() => initial.format));
	let status = $state<'published' | 'draft'>(untrack(() => initial.status));
	let properties = $state<Record<string, string[]>>(untrack(() => structuredClone(initial.properties ?? {})));
	// Photos are shown as on the post; only their alt text is edited here.
	let photos = $state(untrack(() => editor.photos.map((photo, index) => ({ ...photo, alt: initial.photoAlts?.[index] ?? photo.alt }))));
	let slug = $state(untrack(() => initial.slug ?? decodeURIComponent(base.split('/')[4] ?? '')));
	let showOptions = $state(untrack(() => initial.format !== 'markdown'));
	// The textarea stays the form field; the rich editor is a view over it, loaded in the browser only.
	let Editor = $state<typeof import('$lib/components/MarkdownEditor.svelte').default>();
	let source = $state(false);
	// Set when the rich editor would rewrite Markdown it cannot represent exactly.
	let lossy = $state(false);
	const rich = $derived(!!Editor && format === 'markdown' && !source);
	let saving = $state(false);
	// Disabling the buttons on submit drops the clicked button's name and value, so carry it in a hidden field.
	let intent = $state('');
	onMount(() => {
		void Promise.all([import('$lib/components/MarkdownEditor.svelte'), import('$lib/markdown-editor')]).then(([module, markdown]) => {
			lossy = format === 'markdown' && !!content && !markdown.roundTrips(content);
			source = lossy;
			Editor = module.default;
		}).catch(() => { /* The Markdown textarea remains usable. */ });
	});
</script>

<svelte:head><title>Edit {kindLabel} — Casey Gollan</title></svelte:head>

<ComposerBar>
	<Button variant="icon" icon="close" label={editor.pull ? 'Back to the composer' : 'Back to the post'} href={editor.pull ? '/new/' : base} />
	<span class="kind"><Icon name={kindIcon} size={18} /> Edit {kindLabel}</span>
	{#snippet actions()}
		{#if editor.github}<Button variant="icon" icon="github" label="Open on GitHub" href={editor.github} target="_blank" rel="noopener noreferrer" />{/if}
		{#if !reaction && !editor.pull}<Button variant="icon" icon="share" label="Syndicate" href="{base}syndicate/" />{/if}
		{#if unpublished}
			<Button variant="quiet" type="submit" form="editor" name="intent" value="save" disabled={saving}>{saving && intent !== 'publish' ? 'Saving…' : 'Save draft'}</Button>
			<Button variant="primary" type="submit" form="editor" name="intent" value="publish" disabled={saving}>{saving && intent === 'publish' ? 'Publishing…' : 'Publish'}</Button>
		{:else}
			<Button variant="primary" type="submit" form="editor" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{/if}
	{/snippet}
</ComposerBar>
{#if form?.message}<Notice tone={form.saved ? 'info' : 'error'}>{form.message}</Notice>
{:else if merged}<Notice tone="info">Published. Pull request #{merged} was merged, and the public page appears after the site rebuilds, usually within a few minutes.</Notice>
{:else if editor.pull}<Notice tone="info">This draft is on <a href={editor.pull.url} target="_blank" rel="noopener noreferrer">pull request #{editor.pull.number}</a> in the content repository. Save draft commits to its branch. Publish also merges it.</Notice>
{:else if moved}<Notice tone="info">Saved at this new address. The old one redirects here once the site rebuilds, usually within a few minutes.</Notice>{/if}
<form id="editor" class="composer" method="POST" onsubmit={event => { intent = (event.submitter as HTMLButtonElement | null)?.value ?? ''; saving = true; }}>
	{#if intent}<input type="hidden" name="intent" value={intent} />{/if}
	<input type="hidden" name="csrf" value={csrf} />
	<input type="hidden" name="revision" value={editor.revision} />
	{#if !reaction}
		<input class="title" class:small={!name && kindLabel !== 'article'} name="name" bind:value={name} placeholder={kindLabel === 'article' ? 'Title' : 'Title (optional)'} aria-label="Title" autocomplete="off" />
	{/if}
	<FrontmatterProperties bind:properties bind:status bind:slug {savedSlug} address={base.slice(0, base.lastIndexOf('/', base.length - 2) + 1)} suggestedSlug={name} readOnly={editor.readOnly} published={editor.published} updated={editor.updated} />
	<AttachedPhotos bind:photos />
	{#if rich && Editor}
		<div class="rich"><Editor bind:value={content} label="Content" bare /></div>
	{/if}
	<div hidden={rich}>
		<textarea class="body" class:mono={format !== 'text'} name="content" bind:value={content} placeholder={reaction ? 'Add a comment (optional)' : 'Write something'} aria-label="Content" rows={reaction ? 3 : 8}></textarea>
	</div>
	{#if editor.convertedFromHtml}<p class="hint">This post was stored as HTML. It opens as Markdown, and saving stores it as Markdown.</p>
	{:else if format === 'html'}<p class="hint">This post uses HTML that has no Markdown equivalent, so it stays HTML.</p>{/if}
	{#if lossy && Editor && format === 'markdown'}<p class="hint">This post uses Markdown the rich text editor would rewrite, so it opened as source.</p>{/if}
	<div class="panel options" hidden={!showOptions}>
		<label class="mini">Format<select name="format" bind:value={format}><option value="text">Plain text</option><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>
		{#if Editor && format === 'markdown'}<label class="check"><input type="checkbox" bind:checked={source} /> Edit Markdown source</label>{/if}
	</div>
	<ComposerToolbar label="Post options">
		<Button variant="icon" icon="sliders" label="Format" pressed={showOptions} onclick={() => { showOptions = !showOptions; }} />
		{#snippet end()}<span class="count">{content.length || ''}</span>{/snippet}
	</ComposerToolbar>
</form>
<p class="hint footer">
	The date of a post stays fixed; a new slug keeps the old address as a redirect.
	Drafts leave the public site, but their source stays visible in the content repository{#if editor.github}, where you can <a href={editor.github} target="_blank" rel="noopener noreferrer">edit the file directly</a>{/if}.
</p>

<style>
	:global(.compose-page) { max-width: 40rem; }
	[hidden] { display: none !important; }
	a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
	.kind { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2); color: var(--text-primary); font-size: var(--fs-sm); font-weight: var(--fw-medium); }
	.composer { display: flex; flex-direction: column; gap: var(--space-2); }
	input, select, textarea { font: inherit; color: var(--text-primary); }
	input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 1; }
	.title, .body { width: 100%; box-sizing: border-box; padding: 0; border: 0; background: transparent; outline: none; }
	.title { font-size: var(--fs-2xl); font-weight: var(--fw-semibold); line-height: var(--lh-tight); letter-spacing: var(--tracking-tight); }
	.title.small { font-size: var(--fs-lg); font-weight: var(--fw-regular); }
	.body { min-height: 6rem; resize: none; font-size: var(--fs-lg); line-height: var(--lh-normal); field-sizing: content; }
	.body.mono { font-family: var(--font-mono); font-size: var(--fs-base); }
	.rich { margin: var(--space-1) 0; }
	.panel.options { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); align-items: end; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); }
	.mini { display: flex; flex-direction: column; gap: var(--space-1); color: var(--text-muted); font-size: var(--fs-xs); }
	.mini select { box-sizing: border-box; width: 100%; padding: 0.4rem 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: var(--fs-sm); }
	.check { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--fs-sm); }
	.count { min-width: 2.5rem; color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; }
	.hint { margin: var(--space-1) 0; color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.footer { margin-top: var(--space-4); font-size: var(--fs-xs); }
</style>
