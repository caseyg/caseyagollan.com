<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import { COMPOSER_KINDS, LEG_KEYS, type ComposerFields, type LegFields } from '$lib/composer-kinds';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import { Button, Checkbox, Heading, Notice, Page, PageHeader, TextField } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const kind = $derived(data.kind);
	const info = $derived(COMPOSER_KINDS[data.kind]);
	// A failed submit keeps what was typed; otherwise start from the draft or the share link.
	const initial: ComposerFields = untrack(() => (form && 'fields' in form ? form.fields as ComposerFields : undefined) ?? (data.signedIn ? data.fields : {}));
	const value = (key: string) => typeof initial[key] === 'string' ? initial[key] as string : '';
	const emptyLeg = (): LegFields => ({ 'transit-type': 'air', operator: '', number: '', origin: '', destination: '', departure: '', arrival: '' });

	let content = $state(value('content'));
	let format = $state(value('format') || (untrack(() => data.kind) === 'article' ? 'markdown' : 'text'));
	let location = $state(value('location'));
	let syndicateTo = $state<string[]>((initial['syndicate-to'] as string[] | undefined) ?? []);
	let photos = $state<{ url: string; alt: string }[]>(((initial.photo as string[] | undefined) ?? []).map((url, index) => ({ url, alt: (initial['photo-alt'] as string[] | undefined)?.[index] ?? '' })));
	let videos = $state<string[]>((initial.video as string[] | undefined) ?? []);
	let legs = $state<LegFields[]>((initial.legs as LegFields[] | undefined)?.length ? initial.legs as LegFields[] : [emptyLeg()]);
	let uploading = $state(0);
	let uploadError = $state('');
	let locating = $state(false);
	let locationError = $state('');
	let submitting = $state(false);
	let photoUrl = $state('');

	let Editor = $state<typeof import('$lib/components/MarkdownEditor.svelte').default>();
	let source = $state(false);
	const rich = $derived(!!Editor && format === 'markdown' && !source);

	const hasContent = $derived(kind !== 'like');
	const hasPhotos = $derived(!['like', 'repost', 'video', 'itinerary', 'event'].includes(kind));
	const hasLocation = $derived(['note', 'photo', 'article', 'reply', 'food', 'drink', 'review', 'video'].includes(kind));
	const short = $derived(!['article', 'event', 'review'].includes(kind));

	onMount(() => {
		if (!data.signedIn) return;
		rememberOwner(true);
		void Promise.all([import('$lib/components/MarkdownEditor.svelte'), import('$lib/markdown-editor')]).then(([module, markdown]) => {
			source = format === 'markdown' && !!content && !markdown.roundTrips(content);
			Editor = module.default;
		}).catch(() => { /* The Markdown textarea remains usable. */ });
	});

	async function upload(files: FileList | null, target: 'photo' | 'video') {
		if (!files?.length || !data.signedIn) return;
		uploadError = '';
		for (const file of Array.from(files)) {
			uploading++;
			try {
				const body = new FormData();
				body.append('file', file);
				const response = await fetch('/new/media/', { method: 'POST', body, credentials: 'same-origin', headers: { 'x-csrf-token': data.csrf } });
				const location = response.headers.get('Location');
				if (!response.ok || !location) {
					const failure = await response.json().catch(() => ({})) as { error_description?: string };
					throw new Error(failure.error_description ?? 'The upload failed.');
				}
				if (target === 'photo') photos.push({ url: location, alt: '' }); else videos.push(location);
			} catch (cause) { uploadError = `${file.name}: ${cause instanceof Error ? cause.message : 'The upload failed.'}`; }
			finally { uploading--; }
		}
	}

	function locate() {
		if (!navigator.geolocation) { locationError = 'This browser cannot share its location.'; return; }
		locating = true; locationError = '';
		navigator.geolocation.getCurrentPosition(position => {
			const { latitude, longitude, accuracy } = position.coords;
			location = `geo:${latitude.toFixed(5)},${longitude.toFixed(5)};u=${Math.round(accuracy)}`;
			locating = false;
		}, () => { locationError = 'Your location could not be found.'; locating = false; }, { enableHighAccuracy: true, timeout: 15000 });
	}

	const legLabels: Record<(typeof LEG_KEYS)[number], string> = { 'transit-type': 'Mode', operator: 'Operator', number: 'Number', origin: 'From', destination: 'To', departure: 'Departs', arrival: 'Arrives' };
</script>

<svelte:head><title>New {info.label.toLowerCase()} — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main">
	<PageHeader backHref="/new/" backText="New post" tight>
		<Heading level={1} size="display">{data.draft ? `Edit ${info.label.toLowerCase()} draft` : `New ${info.label.toLowerCase()}`}</Heading>
	</PageHeader>
	{#if !data.signedIn}
		<OwnerSignIn message="Sign in to post." />
	{:else}
		{#if form?.message}<Notice tone="error">{form.message}</Notice>
		{:else if page.url.searchParams.has('saved')}<Notice>Draft saved to the private drafts repository.</Notice>{/if}
		<form method="POST" onsubmit={() => { submitting = true; }}>
			<input type="hidden" name="csrf" value={data.csrf} />
			{#if data.draft}
				<input type="hidden" name="draft-id" value={data.draft.id} />
				<input type="hidden" name="draft-sha" value={data.draft.sha} />
			{/if}

			{#if kind === 'reply' || kind === 'rsvp'}
				<TextField label={kind === 'rsvp' ? 'Event URL' : 'Reply to'} name="in-reply-to" type="url" value={value('in-reply-to')} required autocomplete="off" spellcheck="false" />
			{:else if kind === 'note'}
				<TextField label="Reply to (optional)" name="in-reply-to" type="url" value={value('in-reply-to')} autocomplete="off" spellcheck="false" />
			{:else if kind === 'bookmark'}
				<TextField label="Bookmark URL" name="bookmark-of" type="url" value={value('bookmark-of')} required autocomplete="off" spellcheck="false" />
			{:else if kind === 'like'}
				<TextField label="Like of" name="like-of" type="url" value={value('like-of')} required autocomplete="off" spellcheck="false" />
			{:else if kind === 'repost'}
				<TextField label="Repost of" name="repost-of" type="url" value={value('repost-of')} required autocomplete="off" spellcheck="false" />
			{/if}

			{#if kind === 'rsvp'}
				<fieldset class="choices">
					<legend>RSVP</legend>
					{#each [['yes', 'Going'], ['maybe', 'Maybe'], ['interested', 'Interested'], ['no', 'Not going']] as [answer, label] (answer)}
						<label><input type="radio" name="rsvp" value={answer} checked={value('rsvp') === answer} required /> {label}</label>
					{/each}
				</fieldset>
			{/if}

			{#if kind === 'article' || kind === 'bookmark' || kind === 'event' || kind === 'review'}
				<TextField label={kind === 'event' ? 'Event name' : kind === 'review' ? 'Review title (optional)' : kind === 'bookmark' ? 'Title' : 'Title'} name="name" value={value('name')} required={kind === 'article' || kind === 'event'} autocomplete="off" />
			{/if}
			{#if kind === 'article'}<TextField multiline label="Summary" name="summary" rows={2} value={value('summary')} />{/if}

			{#if kind === 'event'}
				<div class="row">
					<TextField label="Starts" name="start" type="datetime-local" value={value('start')} required />
					<TextField label="Ends" name="end" type="datetime-local" value={value('end')} />
				</div>
				<TextField label="Venue" name="location-name" value={value('location-name')} autocomplete="off" />
			{/if}

			{#if kind === 'review'}
				<div class="row">
					<TextField label="What you are reviewing" name="item-name" value={value('item-name')} required autocomplete="off" />
					<TextField label="Its URL (optional)" name="item-url" type="url" value={value('item-url')} autocomplete="off" spellcheck="false" />
				</div>
				<fieldset class="choices">
					<legend>Rating</legend>
					{#each [1, 2, 3, 4, 5] as stars (stars)}
						<label><input type="radio" name="rating" value={String(stars)} checked={value('rating') === String(stars)} /> {'★'.repeat(stars)}</label>
					{/each}
				</fieldset>
			{/if}

			{#if kind === 'food' || kind === 'drink'}
				<TextField label={kind === 'food' ? 'What did you eat?' : 'What did you drink?'} name="food-name" value={value('food-name')} required autocomplete="off" />
			{/if}

			{#if kind === 'itinerary'}
				{#each legs as leg, index (index)}
					<fieldset class="leg">
						<legend>Leg {index + 1}</legend>
						<label class="select">{legLabels['transit-type']}
							<select name="leg-transit-type" bind:value={leg['transit-type']}>
								{#each ['air', 'train', 'bus', 'boat', 'car', 'generic'] as mode (mode)}<option value={mode}>{mode}</option>{/each}
							</select>
						</label>
						<TextField label={legLabels.operator} name="leg-operator" bind:value={leg.operator} autocomplete="off" />
						<TextField label={legLabels.number} name="leg-number" bind:value={leg.number} autocomplete="off" />
						<TextField label={legLabels.origin} name="leg-origin" bind:value={leg.origin} required autocomplete="off" />
						<TextField label={legLabels.destination} name="leg-destination" bind:value={leg.destination} required autocomplete="off" />
						<TextField label={legLabels.departure} name="leg-departure" type="datetime-local" bind:value={leg.departure} required />
						<TextField label={legLabels.arrival} name="leg-arrival" type="datetime-local" bind:value={leg.arrival} required />
						{#if legs.length > 1}<Button size="sm" variant="quiet" onclick={() => legs.splice(index, 1)}>Remove leg</Button>{/if}
					</fieldset>
				{/each}
				<Button size="sm" onclick={() => legs.push(emptyLeg())}>Add leg</Button>
			{/if}

			{#if hasContent}
				{#if Editor && format === 'markdown'}
					<div class="modes" role="group" aria-label="Content editor">
						<button type="button" aria-pressed={!source} onclick={() => { source = false; }}>Rich text</button>
						<button type="button" aria-pressed={source} onclick={() => { source = true; }}>Markdown</button>
					</div>
				{/if}
				{#if rich && Editor}
					<div class="rich">
						<span class="label">Content</span>
						<Editor bind:value={content} label="Content" />
					</div>
				{/if}
				<div hidden={rich}>
					<TextField multiline mono={format !== 'text'} label={kind === 'bookmark' ? 'Comment' : kind === 'repost' ? 'Comment (optional)' : 'Content'} name="content" rows={short ? 5 : 16} bind:value={content} />
				</div>
				<p class="count" aria-live="polite">{content.length} characters</p>
			{/if}

			{#if hasPhotos && data.mediaEnabled}
				<fieldset class="media">
					<legend>Photos</legend>
					{#each photos as photo, index (photo.url)}
						<div class="photo">
							<img src={photo.url} alt="" />
							<input type="hidden" name="photo" value={photo.url} />
							<TextField label="Alt text" name="photo-alt" bind:value={photo.alt} autocomplete="off" />
							<Button size="sm" variant="quiet" onclick={() => photos.splice(index, 1)}>Remove</Button>
						</div>
					{/each}
					<label class="upload">Add photos <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" multiple onchange={event => { void upload(event.currentTarget.files, 'photo'); event.currentTarget.value = ''; }} /></label>
					<div class="row inline">
						<TextField label="Or a photo URL" type="url" bind:value={photoUrl} autocomplete="off" spellcheck="false" />
						<Button size="sm" disabled={!photoUrl} onclick={() => { photos.push({ url: photoUrl, alt: '' }); photoUrl = ''; }}>Add</Button>
					</div>
				</fieldset>
			{/if}
			{#if kind === 'video'}
				<fieldset class="media">
					<legend>Video</legend>
					{#each videos as video, index (video)}
						<div class="photo">
						<!-- svelte-ignore a11y_media_has_caption -->
							<video src={video} controls preload="metadata"></video>
							<input type="hidden" name="video" value={video} />
							<Button size="sm" variant="quiet" onclick={() => videos.splice(index, 1)}>Remove</Button>
						</div>
					{/each}
					{#if data.mediaEnabled}<label class="upload">Add a video <input type="file" accept="video/mp4,video/quicktime,video/webm" onchange={event => { void upload(event.currentTarget.files, 'video'); event.currentTarget.value = ''; }} /></label>
					{:else}<p class="hint">Media uploads are not configured.</p>{/if}
				</fieldset>
			{/if}
			{#if uploading}<p class="hint" aria-live="polite">Uploading…</p>{/if}
			{#if uploadError}<Notice tone="error">{uploadError}</Notice>{/if}

			{#if hasLocation}
				<div class="row inline">
					<TextField label="Location" name="location" bind:value={location} placeholder="A place name, or use your current location" autocomplete="off" />
					<Button size="sm" disabled={locating} onclick={locate}>{locating ? 'Locating…' : 'Use current location'}</Button>
				</div>
				{#if locationError}<p class="hint">{locationError}</p>{/if}
			{/if}

			<TextField label="Tags" name="category" value={value('category')} placeholder="e.g. web, personal" autocomplete="off" autocapitalize="off" />

			{#if data.syndication.length && kind !== 'like' && kind !== 'repost'}
				<fieldset class="choices">
					<legend>Syndicate to</legend>
					{#each data.syndication as target (target.uid)}
						<Checkbox name="syndicate-to" value={target.uid} bind:group={syndicateTo}>{target.name}</Checkbox>
					{/each}
				</fieldset>
			{/if}

			<details class="more" open={!!(value('slug') || value('published'))}>
				<summary>More options</summary>
				{#if hasContent}
					<label class="select">Content Type
						<select name="format" bind:value={format}>
							<option value="text">Text</option>
							<option value="markdown">Markdown</option>
							<option value="html">HTML</option>
						</select>
					</label>
				{/if}
				<TextField label="Slug" name="slug" value={value('slug')} hint="Letters, numbers and hyphens. Left blank, one is made from the title." autocomplete="off" autocapitalize="off" spellcheck="false" />
				<TextField label="Published" name="published" type="datetime-local" value={value('published')} hint={`Left blank, the post is dated when it is published. Times are in ${data.timeZone}.`} />
			</details>

			<div class="actions">
				<Button type="submit" variant="primary" name="intent" value="publish" disabled={submitting || uploading > 0}>Publish</Button>
				{#if data.draftsEnabled}<Button type="submit" name="intent" value="save" formnovalidate disabled={submitting || uploading > 0}>Save draft</Button>{/if}
				<Button href="/new/" variant="quiet">Cancel</Button>
			</div>
			<p class="hint">
				{#if data.draftsEnabled}Drafts are saved to a private GitHub repository and never appear on the public site or in the content repository.{:else}Drafts are not configured, so this post can only be published.{/if}
				{#if data.draft} Publishing removes this draft.{/if}
			</p>
		</form>
	{/if}
</Page>

<style>
	.row { display: flex; flex-wrap: wrap; gap: 0 var(--space-4); }
	.row > :global(*) { flex: 1 1 14rem; }
	.row.inline { align-items: flex-end; }
	.row.inline > :global(.button) { flex: 0 0 auto; margin-bottom: var(--space-3); }
	fieldset { margin: var(--space-3) 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); }
	legend { padding: 0 var(--space-1); color: var(--text-secondary); font-size: var(--fs-sm); }
	.choices label { display: inline-flex; align-items: center; gap: var(--space-1); margin-right: var(--space-4); }
	.leg { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0 var(--space-3); align-items: start; }
	.leg .select { margin-top: var(--space-3); }
	.photo { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); margin: var(--space-2) 0; }
	.photo img, .photo video { width: 6rem; max-height: 6rem; object-fit: cover; border-radius: var(--radius-sm); }
	.photo > :global(.field) { flex: 1 1 14rem; }
	.upload { display: inline-flex; flex-direction: column; gap: var(--space-1); margin: var(--space-2) 0; color: var(--text-secondary); font-size: var(--fs-sm); }
	.modes { display: flex; justify-content: flex-end; gap: var(--space-1); margin: var(--space-3) 0 calc(-1 * var(--space-3)); }
	.modes button { padding: var(--space-1) var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
	.modes button[aria-pressed='true'] { background: var(--surface-2); color: var(--text-primary); }
	.rich { display: flex; flex-direction: column; gap: var(--space-1); margin: var(--space-3) 0; }
	.label { color: var(--text-secondary); font-size: var(--fs-sm); line-height: var(--lh-snug); }
	.count { margin: calc(-1 * var(--space-2)) 0 var(--space-3); color: var(--text-muted); font-size: var(--fs-xs); text-align: right; }
	.more { margin: var(--space-3) 0; }
	.more summary { color: var(--text-secondary); font-size: var(--fs-sm); cursor: pointer; }
	.select { display: flex; flex-direction: column; gap: var(--space-1); margin: var(--space-3) 0; color: var(--text-secondary); font-size: var(--fs-sm); line-height: var(--lh-snug); }
	select { box-sizing: border-box; width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface-sunken); color: var(--text-primary); font: inherit; font-size: var(--fs-base); line-height: var(--lh-normal); }
	.hint { max-width: 40rem; margin: var(--space-2) 0 var(--space-4); color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); margin-top: var(--space-4); }
</style>
