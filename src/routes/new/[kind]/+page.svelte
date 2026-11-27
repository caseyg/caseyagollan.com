<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import { CITE_KINDS, COMPOSER_KINDS, isCiteKind, type ComposerFields, type ComposerKind, type LegFields } from '$lib/composer-kinds';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
	import ComposerBar from '$lib/components/composer/ComposerBar.svelte';
	import DraftsMenu from '$lib/components/composer/DraftsMenu.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ComposerToolbar from '$lib/components/composer/ComposerToolbar.svelte';
	import { Heading, Notice, Page, PageHeader, SelectMenu, CheckboxGroup, ToggleChip } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const KIND_ICONS = Object.fromEntries(Object.entries(COMPOSER_KINDS).map(([kind, details]) => [kind, details.icon])) as Record<ComposerKind, IconName>;
	const kindOptions = (Object.entries(COMPOSER_KINDS) as [ComposerKind, (typeof COMPOSER_KINDS)[ComposerKind]][]).map(([value, details]) => ({ value, label: details.label, title: details.hint, group: details.group, href: `/new/${value}/` }));
	const PLACEHOLDERS: Partial<Record<ComposerKind, string>> = {
		note: 'What’s on your mind?', article: 'Tell your story…', reply: 'Write your reply', bookmark: 'Add a comment (optional)',
		repost: 'Add a comment (optional)', rsvp: 'Add a note (optional)', photo: 'Add a caption', video: 'Add a caption',
		event: 'Describe the event (optional)', review: 'What did you think?', itinerary: 'Add a note (optional)', food: 'How was it? (optional)', drink: 'How was it? (optional)',
		quotation: 'Why it stuck with you (optional)', issue: 'Describe the issue', collection: 'Introduce the collection (optional)', audio: 'Add a caption',
		checkin: 'What are you up to? (optional)', venue: 'Why it’s worth a visit (optional)', read: 'Thoughts so far (optional)', watch: 'What did you think? (optional)',
		listen: 'What did you think? (optional)', play: 'How’s it going? (optional)', jam: 'Why this one? (optional)', exercise: 'How did it feel? (optional)', recipe: 'The steps'
	};
	const CITE_TITLES: Record<string, string> = { read: 'What are you reading?', watch: 'What did you watch?', listen: 'What did you listen to?', play: 'What did you play?', jam: 'What song?' };
	const ACTIVITIES = ['run', 'walk', 'ride', 'swim', 'hike', 'row', 'yoga', 'climb', 'lift'];

	const kind = $derived(data.kind);
	const info = $derived(COMPOSER_KINDS[data.kind]);
	// A failed submit keeps what was typed; otherwise start from the draft or the share link.
	const initial: ComposerFields = untrack(() => (form && 'fields' in form ? form.fields as ComposerFields : undefined) ?? (data.signedIn ? data.fields : {}));
	const value = (key: string) => typeof initial[key] === 'string' ? initial[key] as string : '';
	const emptyLeg = (): LegFields => ({ 'transit-type': 'air', operator: '', number: '', origin: '', destination: '', departure: '', arrival: '' });
	const startKind = untrack(() => data.kind);

	let content = $state(value('content'));
	let format = $state(value('format') || (startKind === 'article' ? 'markdown' : 'text'));
	let location = $state(value('location'));
	let category = $state(value('category'));
	let replyTo = $state(value('in-reply-to'));
	let syndicateTo = $state<string[]>((initial['syndicate-to'] as string[] | undefined) ?? []);
	let photos = $state<{ url: string; alt: string }[]>(((initial.photo as string[] | undefined) ?? []).map((url, index) => ({ url, alt: (initial['photo-alt'] as string[] | undefined)?.[index] ?? '' })));
	let videos = $state<string[]>((initial.video as string[] | undefined) ?? []);
	let audio = $state<string[]>((initial.audio as string[] | undefined) ?? []);
	let children = $state<string[]>((initial.children as string[] | undefined)?.length ? initial.children as string[] : ['']);
	let legs = $state<LegFields[]>((initial.legs as LegFields[] | undefined)?.length ? initial.legs as LegFields[] : [emptyLeg()]);
	let rating = $state(value('rating'));
	// Optional fields stay out of sight until their icon is pressed, or they already hold a value.
	let open = $state({
		reply: startKind === 'note' && !!value('in-reply-to'), location: !!value('location'), tags: !!value('category'),
		options: !!(value('slug') || value('published') || (startKind === 'review' && value('name'))), photoUrl: false,
		place: !!(value('venue-url') || value('street-address') || value('locality') || value('region') || value('country-name'))
	});
	let uploading = $state(0);
	let uploadError = $state('');
	let locating = $state(false);
	let locationError = $state('');
	let submitting = $state(false);
	// Disabling the buttons on submit drops the clicked button's name/value from the form data, so carry it in a hidden field.
	let intent = $state('');
	let photoUrl = $state('');
	let photoInput: HTMLInputElement | undefined = $state();
	let videoInput: HTMLInputElement | undefined = $state();
	let audioInput: HTMLInputElement | undefined = $state();

	let Editor = $state<typeof import('$lib/components/MarkdownEditor.svelte').default>();
	let source = $state(false);
	const rich = $derived(!!Editor && format === 'markdown' && !source);

	const hasContent = $derived(kind !== 'like');
	const hasPhotos = $derived(data.signedIn && data.mediaEnabled && !['like', 'repost', 'video', 'audio', 'itinerary', 'event', 'issue', 'collection'].includes(kind));
	const hasLocation = $derived(['note', 'photo', 'article', 'reply', 'food', 'drink', 'review', 'video', 'audio', 'exercise'].includes(kind));
	/** Checkins and venues are places: their name is shown, the address waits behind the pin. */
	const isPlace = $derived(kind === 'checkin' || kind === 'venue');
	const limit = $derived(syndicateTo.some(uid => uid.endsWith('/bluesky')) ? 300 : syndicateTo.some(uid => uid.endsWith('/mastodon')) ? 500 : 0);
	const published = $derived(page.url.searchParams.get('published'));
	const bookmarklet = $derived(`javascript:(()=>{location.href=${JSON.stringify(`${page.url.origin}/new/bookmark/?url=`)}+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&selection='+encodeURIComponent(String(getSelection()))})()`);

	onMount(() => {
		if (!data.signedIn) return;
		rememberOwner(true);
		void Promise.all([import('$lib/components/MarkdownEditor.svelte'), import('$lib/markdown-editor')]).then(([module, markdown]) => {
			source = format === 'markdown' && !!content && !markdown.roundTrips(content);
			Editor = module.default;
		}).catch(() => { /* The Markdown textarea remains usable. */ });
	});

	async function reveal(panel: keyof typeof open, id: string) {
		open[panel] = !open[panel];
		if (open[panel]) { await tick(); document.getElementById(id)?.focus(); }
	}

	async function upload(files: FileList | null, target: 'photo' | 'video' | 'audio') {
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
				if (target === 'photo') photos.push({ url: location, alt: '' }); else if (target === 'video') videos.push(location); else audio.push(location);
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
</script>

<svelte:head>
	<title>New {info.label.toLowerCase()} — Casey Gollan</title>
	<meta name="robots" content="noindex,nofollow" />
	<!-- Without JavaScript the icons cannot open their fields, so show every field. -->
	<noscript><style>.composer [hidden].panel { display: flex !important; }</style></noscript>
</svelte:head>

<Page as="main" class="compose-page">
	{#if !data.signedIn}
		<PageHeader trail={[{ label: 'Casey Gollan', href: '/', icon: '👋' }]} tight><Heading level={1} size="display">New post</Heading></PageHeader>
		<OwnerSignIn message="Sign in to post." />
	{:else}
		<ComposerBar>
			<Button variant="icon" icon="close" label="Close" href="/account" />
			<!-- Full page loads: switching type must start the form from the server data. -->
			<SelectMenu variant="quiet" columns={2} reload label="Post type: {info.label}" current={info.label} options={kindOptions}>
				{#snippet icon(option)}<Icon name={KIND_ICONS[option.value as ComposerKind]} size={18} />{/snippet}
			</SelectMenu>
			{#snippet actions()}
			<DraftsMenu drafts={data.draftsEnabled ? data.drafts : undefined} error={data.draftsError} content={data.contentDrafts} currentId={data.draft?.id} csrf={data.csrf} />
			{#if data.draftsEnabled}
				<Button variant="quiet" type="submit" form="composer" name="intent" value="save" formnovalidate disabled={submitting || uploading > 0}>Save draft</Button>
			{/if}
			<Button variant="primary" type="submit" form="composer" name="intent" value="publish" disabled={submitting || uploading > 0}>{submitting && intent === 'publish' ? 'Posting…' : 'Publish'}</Button>
			{/snippet}
		</ComposerBar>

		{#if form?.message}<Notice tone="error">{form.message}</Notice>
		{:else if published}<Notice>Posted. <a href={published}>It will appear here</a> after the site rebuilds, usually within a few minutes.{#if page.url.searchParams.has('draft-kept')} The draft could not be removed; discard it from Drafts.{/if}</Notice>
		{:else if page.url.searchParams.has('saved')}<Notice>Draft saved.</Notice>
		{:else if page.url.searchParams.has('discarded')}<Notice>Draft discarded.</Notice>{/if}

		<form id="composer" class="composer" method="POST" action="?/submit" onsubmit={event => { intent = (event.submitter as HTMLButtonElement | null)?.value ?? 'publish'; submitting = true; }}>
			{#if intent}<input type="hidden" name="intent" value={intent} />{/if}
			<input type="hidden" name="csrf" value={data.csrf} />
			{#if data.draft}
				<input type="hidden" name="draft-id" value={data.draft.id} />
				<input type="hidden" name="draft-sha" value={data.draft.sha} />
			{/if}

			{#snippet target(name: string, label: string, icon: IconName, required = true)}
				<label class="target"><Icon name={icon} size={18} /><span class="visually-hidden">{label}</span>
					<input {name} type="url" value={value(name)} placeholder={label} {required} autocomplete="off" spellcheck="false" />
				</label>
			{/snippet}
			{#if kind === 'reply'}{@render target('in-reply-to', 'URL you are replying to', 'reply')}
			{:else if kind === 'rsvp'}{@render target('in-reply-to', 'Event URL', 'calendar')}
			{:else if kind === 'bookmark'}{@render target('bookmark-of', 'URL to bookmark', 'link')}
			{:else if kind === 'like'}{@render target('like-of', 'URL of the post you like', 'heart')}
			{:else if kind === 'repost'}{@render target('repost-of', 'URL of the post to repost', 'repost')}
			{:else if kind === 'issue'}{@render target('in-reply-to', 'Repository URL', 'github')}{/if}

			{#if kind === 'note'}
				<label class="target panel" hidden={!open.reply}><Icon name="reply" size={18} /><span class="visually-hidden">Reply to</span>
					<input id="field-reply" name="in-reply-to" type="url" bind:value={replyTo} placeholder="Replying to a URL (optional)" autocomplete="off" spellcheck="false" />
				</label>
			{/if}

			{#if kind === 'rsvp'}
				<fieldset class="segmented"><legend class="visually-hidden">RSVP</legend>
					{#each [['yes', 'Going'], ['maybe', 'Maybe'], ['interested', 'Interested'], ['no', 'Can’t go']] as [answer, label] (answer)}
						<label><input type="radio" name="rsvp" value={answer} checked={value('rsvp') === answer} required /><span>{label}</span></label>
					{/each}
				</fieldset>
			{/if}

			{#if kind === 'article' || kind === 'event' || kind === 'issue' || kind === 'collection' || kind === 'venue' || kind === 'recipe'}
				{@const label = { event: 'Event name', issue: 'Issue title', collection: 'Collection title', venue: 'Venue name', recipe: 'Recipe name' }[kind as string] ?? 'Title'}
				<input class="title" name="name" value={value('name')} placeholder={label} aria-label={label} required autocomplete="off" />
			{:else if kind === 'audio'}
				<input class="title small" name="name" value={value('name')} placeholder="Title (optional)" aria-label="Title" autocomplete="off" />
			{:else if kind === 'checkin'}
				<input class="title" name="venue-name" value={value('venue-name')} placeholder="Where are you?" aria-label="Where you are" required autocomplete="off" />
			{:else if isCiteKind(kind)}
				<input class="title" name="cite-name" value={value('cite-name')} placeholder={CITE_TITLES[kind]} aria-label="Title" required autocomplete="off" />
				<input class="subtitle" name="cite-author" value={value('cite-author')} placeholder="{CITE_KINDS[kind]} (optional)" aria-label={CITE_KINDS[kind]} autocomplete="off" />
			{:else if kind === 'exercise'}
				<input class="title" name="activity" list="activities" value={value('activity')} placeholder="What did you do?" aria-label="Activity" required autocomplete="off" />
				<datalist id="activities">{#each ACTIVITIES as activity (activity)}<option value={activity}></option>{/each}</datalist>
				<div class="grid two">
					<label class="mini">Distance<input name="distance" value={value('distance')} placeholder="5 km" autocomplete="off" /></label>
					<label class="mini">Minutes<input name="duration" type="number" min="1" step="1" inputmode="numeric" value={value('duration')} /></label>
				</div>
			{:else if kind === 'bookmark'}
				<input class="title small" name="name" value={value('name')} placeholder="Title" aria-label="Title" autocomplete="off" />
			{:else if kind === 'food' || kind === 'drink'}
				<input class="title" name="food-name" value={value('food-name')} placeholder={kind === 'food' ? 'What did you eat?' : 'What did you drink?'} aria-label={kind === 'food' ? 'What you ate' : 'What you drank'} required autocomplete="off" />
			{/if}
			{#if kind === 'article'}<input class="subtitle" name="summary" value={value('summary')} placeholder="Summary (optional)" aria-label="Summary" autocomplete="off" />{/if}

			{#if kind === 'event'}
				<div class="grid two">
					<label class="mini">Starts<input name="start" type="datetime-local" value={value('start')} required /></label>
					<label class="mini">Ends<input name="end" type="datetime-local" value={value('end')} /></label>
				</div>
				<label class="target"><Icon name="pin" size={18} /><span class="visually-hidden">Venue</span><input name="location-name" value={value('location-name')} placeholder="Venue (optional)" autocomplete="off" /></label>
			{/if}

			{#if kind === 'review'}
				<input class="title" name="item-name" value={value('item-name')} placeholder="What are you reviewing?" aria-label="What you are reviewing" required autocomplete="off" />
				<label class="target"><Icon name="link" size={18} /><span class="visually-hidden">Its URL</span><input name="item-url" type="url" value={value('item-url')} placeholder="Its URL (optional)" autocomplete="off" spellcheck="false" /></label>
				<fieldset class="stars"><legend class="visually-hidden">Rating</legend>
					{#each [1, 2, 3, 4, 5] as stars (stars)}
						<label class:on={Number(rating) >= stars} title="{stars} of 5"><input type="radio" name="rating" value={String(stars)} bind:group={rating} /><Icon name="star" size={24} /><span class="visually-hidden">{stars} of 5 stars</span></label>
					{/each}
				</fieldset>
			{/if}

			{#if kind === 'read'}
				<fieldset class="segmented"><legend class="visually-hidden">Where you are in it</legend>
					{#each [['to-read', 'Want to read'], ['reading', 'Reading'], ['finished', 'Finished']] as [status, label] (status)}
						<label><input type="radio" name="read-status" value={status} checked={(value('read-status') || 'finished') === status} required /><span>{label}</span></label>
					{/each}
				</fieldset>
			{/if}

			{#if kind === 'quotation'}
				<textarea class="body quote" name="quote" placeholder="The quotation" aria-label="Quotation" rows="3">{value('quote')}</textarea>
				<div class="grid two">
					<label class="mini">Who said it<input name="cite-author" value={value('cite-author')} placeholder="Optional" autocomplete="off" /></label>
					<label class="mini">Where<input name="cite-name" value={value('cite-name')} placeholder="Book, article or talk" autocomplete="off" /></label>
				</div>
			{/if}
			{#if kind === 'quotation' || isCiteKind(kind)}
				<label class="target"><Icon name="link" size={18} /><span class="visually-hidden">Its URL</span>
					<input name="cite-url" type="url" value={value('cite-url')} placeholder={kind === 'quotation' ? 'Source URL (optional)' : 'Its URL (optional)'} autocomplete="off" spellcheck="false" />
				</label>
			{/if}

			{#if isPlace}
				<div class="panel place" hidden={!open.place}>
					<label class="target"><Icon name="link" size={18} /><span class="visually-hidden">Venue URL</span><input id="field-place" name="venue-url" type="url" value={value('venue-url')} placeholder="Its website (optional)" autocomplete="off" spellcheck="false" /></label>
					<div class="grid two">
						<label class="mini">Street address<input name="street-address" value={value('street-address')} autocomplete="off" /></label>
						<label class="mini">City<input name="locality" value={value('locality')} autocomplete="off" /></label>
						<label class="mini">Region<input name="region" value={value('region')} autocomplete="off" /></label>
						<label class="mini">Country<input name="country-name" value={value('country-name')} autocomplete="off" /></label>
					</div>
				</div>
				<input type="hidden" name="location" value={location} />
				{#if location}<p class="hint">Coordinates added. <button class="link" type="button" onclick={() => { location = ''; }}>Remove</button></p>{/if}
				{#if locationError}<p class="hint">{locationError}</p>{/if}
			{/if}

			{#if kind === 'collection'}
				{#each children as _, index (index)}
					<div class="row">
						<label class="target grow"><Icon name="link" size={18} /><span class="visually-hidden">Link {index + 1}</span><input name="child" type="url" bind:value={children[index]} placeholder="A link" required={index === 0} autocomplete="off" spellcheck="false" /></label>
						{#if children.length > 1}<Button variant="icon" size="sm" icon="close" label="Remove link {index + 1}" onclick={() => children.splice(index, 1)} />{/if}
					</div>
				{/each}
				{#if children.length < 100}<span class="add"><Button variant="quiet" icon="plus" onclick={() => children.push('')}>Add link</Button></span>{/if}
			{/if}

			{#if kind === 'recipe'}
				<textarea class="body" name="ingredients" placeholder="Ingredients, one per line" aria-label="Ingredients" rows="4" required>{value('ingredients')}</textarea>
				<div class="grid two">
					<label class="mini">Makes<input name="yield" value={value('yield')} placeholder="4 servings" autocomplete="off" /></label>
					<label class="mini">Minutes<input name="duration" type="number" min="1" step="1" inputmode="numeric" value={value('duration')} /></label>
				</div>
			{/if}

			{#if kind === 'itinerary'}
				{#each legs as leg, index (index)}
					<fieldset class="leg"><legend class="visually-hidden">Leg {index + 1}</legend>
						<div class="grid three">
							<label class="mini">Mode<select name="leg-transit-type" bind:value={leg['transit-type']}>{#each ['air', 'train', 'bus', 'boat', 'car', 'generic'] as mode (mode)}<option value={mode}>{mode}</option>{/each}</select></label>
							<label class="mini">Operator<input name="leg-operator" bind:value={leg.operator} autocomplete="off" /></label>
							<label class="mini">Number<input name="leg-number" bind:value={leg.number} autocomplete="off" /></label>
						</div>
						<div class="grid two">
							<label class="mini">From<input name="leg-origin" bind:value={leg.origin} required autocomplete="off" /></label>
							<label class="mini">To<input name="leg-destination" bind:value={leg.destination} required autocomplete="off" /></label>
							<label class="mini">Departs<input name="leg-departure" type="datetime-local" bind:value={leg.departure} required /></label>
							<label class="mini">Arrives<input name="leg-arrival" type="datetime-local" bind:value={leg.arrival} required /></label>
						</div>
						{#if legs.length > 1}<span class="remove-leg"><Button variant="icon" size="sm" icon="close" label="Remove leg {index + 1}" onclick={() => legs.splice(index, 1)} /></span>{/if}
					</fieldset>
				{/each}
				<span class="add"><Button variant="quiet" icon="plus" onclick={() => legs.push(emptyLeg())}>Add leg</Button></span>
			{/if}

			{#if hasContent}
				{#if rich && Editor}
					<div class="rich"><Editor bind:value={content} label="Content" bare /></div>
				{/if}
				<div hidden={rich}>
					<textarea class="body" class:mono={format !== 'text'} class:long={kind === 'article'} name="content" bind:value={content} placeholder={PLACEHOLDERS[kind]} aria-label="Content" rows={kind === 'article' ? 12 : 4}></textarea>
				</div>
			{/if}

			{#if photos.length || videos.length || audio.length}
				<ul class="attachments">
					{#each photos as photo, index (photo.url)}
						<li>
							<img src={photo.url} alt={photo.alt} />
							<input type="hidden" name="photo" value={photo.url} />
							<input class="alt" name="photo-alt" bind:value={photo.alt} placeholder="Alt text" aria-label="Alt text for photo {index + 1}" autocomplete="off" />
							<button class="remove" type="button" aria-label="Remove photo {index + 1}" onclick={() => photos.splice(index, 1)}><Icon name="close" size={14} /></button>
						</li>
					{/each}
					{#each audio as clip, index (clip)}
						<li class="wide">
							<audio src={clip} preload="metadata" controls></audio>
							<input type="hidden" name="audio" value={clip} />
							<button class="remove" type="button" aria-label="Remove audio {index + 1}" onclick={() => audio.splice(index, 1)}><Icon name="close" size={14} /></button>
						</li>
					{/each}
					{#each videos as video, index (video)}
						<li>
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={video} preload="metadata" controls></video>
							<input type="hidden" name="video" value={video} />
							<button class="remove" type="button" aria-label="Remove video {index + 1}" onclick={() => videos.splice(index, 1)}><Icon name="close" size={14} /></button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if uploading}<p class="hint" aria-live="polite">Uploading…</p>{/if}
			{#if uploadError}<Notice tone="error">{uploadError}</Notice>{/if}
			{#if kind === 'photo' && !photos.length}<p class="hint">Add photos with the image button below.</p>{/if}
			{#if kind === 'video' && !videos.length}<p class="hint">Add a video with the video button below.</p>{/if}
			{#if kind === 'audio' && !audio.length}<p class="hint">Add a recording with the microphone button below.</p>{/if}

			{#if hasPhotos}
				<div class="panel row" hidden={!open.photoUrl}>
					<label class="target grow"><Icon name="link" size={18} /><span class="visually-hidden">Photo URL</span><input id="field-photo-url" type="url" bind:value={photoUrl} placeholder="Add a photo by URL" autocomplete="off" spellcheck="false" /></label>
					<Button variant="quiet" disabled={!photoUrl} onclick={() => { photos.push({ url: photoUrl, alt: '' }); photoUrl = ''; open.photoUrl = false; }}>Add</Button>
				</div>
			{/if}
			{#if hasLocation}
				<div class="panel row" hidden={!open.location}>
					<label class="target grow"><Icon name="pin" size={18} /><span class="visually-hidden">Location</span><input id="field-location" name="location" bind:value={location} placeholder="Add a place" autocomplete="off" /></label>
					<Button variant="icon" icon="locate" label="Use current location" disabled={locating} onclick={locate} />
				</div>
				{#if locationError}<p class="hint">{locationError}</p>{/if}
			{/if}
			<label class="target panel" hidden={!open.tags}><Icon name="hash" size={18} /><span class="visually-hidden">Tags</span>
				<input id="field-tags" name="category" bind:value={category} placeholder="Tags, separated by commas" autocomplete="off" autocapitalize="off" />
			</label>
			<div class="panel options" hidden={!open.options}>
				{#if hasContent}
					<label class="mini">Format<select name="format" bind:value={format}><option value="text">Plain text</option><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>
				{/if}
				{#if kind === 'review'}<label class="mini">Headline<input name="name" value={value('name')} placeholder="Optional" autocomplete="off" /></label>{/if}
				<label class="mini">Slug<input id="field-slug" name="slug" value={value('slug')} placeholder="From the title" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
				<label class="mini">Published<input name="published" type="datetime-local" value={value('published')} /><small>Blank means now. {data.timeZone}.</small></label>
				{#if Editor && format === 'markdown' && hasContent}
					<label class="check"><input type="checkbox" bind:checked={source} /> Edit Markdown source</label>
				{/if}
			</div>

			<ComposerToolbar>
				{#if hasPhotos}
					<Button variant="icon" icon="image" label="Add photos" onclick={() => photoInput?.click()} />
					<input bind:this={photoInput} class="visually-hidden" tabindex="-1" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" multiple onchange={event => { void upload(event.currentTarget.files, 'photo'); event.currentTarget.value = ''; }} />
					<Button variant="icon" icon="link" label="Add a photo by URL" pressed={open.photoUrl} onclick={() => reveal('photoUrl', 'field-photo-url')} />
				{/if}
				{#if kind === 'video' && data.mediaEnabled}
					<Button variant="icon" icon="video" label="Add a video" onclick={() => videoInput?.click()} />
					<input bind:this={videoInput} class="visually-hidden" tabindex="-1" type="file" accept="video/mp4,video/quicktime,video/webm" onchange={event => { void upload(event.currentTarget.files, 'video'); event.currentTarget.value = ''; }} />
				{/if}
				{#if kind === 'audio' && data.mediaEnabled}
					<Button variant="icon" icon="mic" label="Add audio" onclick={() => audioInput?.click()} />
					<input bind:this={audioInput} class="visually-hidden" tabindex="-1" type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/flac" multiple onchange={event => { void upload(event.currentTarget.files, 'audio'); event.currentTarget.value = ''; }} />
				{/if}
				{#if kind === 'note'}<Button variant="icon" icon="reply" label="Reply to a URL" pressed={open.reply || !!replyTo} onclick={() => reveal('reply', 'field-reply')} />{/if}
				{#if isPlace}
					<Button variant="icon" icon="pin" label="Address and website" pressed={open.place} onclick={() => reveal('place', 'field-place')} />
					<Button variant="icon" icon="locate" label="Use current location" pressed={!!location} disabled={locating} onclick={locate} />
				{/if}
				{#if hasLocation}<Button variant="icon" icon="pin" label="Add location" pressed={open.location || !!location} onclick={() => reveal('location', 'field-location')} />{/if}
				<Button variant="icon" icon="hash" label="Add tags" pressed={open.tags || !!category} onclick={() => reveal('tags', 'field-tags')} />
				<Button variant="icon" icon="sliders" label="Slug, date and format" pressed={open.options} onclick={() => reveal('options', 'field-slug')} />
				{#snippet end()}
				{#if data.syndication.length && kind !== 'like' && kind !== 'repost'}
					<CheckboxGroup layout="row" label="Also post to" name="syndicate-to" bind:value={syndicateTo}>
						{#each data.syndication as destination (destination.uid)}
							<ToggleChip value={destination.uid} title="Also post to {destination.name}">{destination.name}</ToggleChip>
						{/each}
					</CheckboxGroup>
				{/if}
				{#if hasContent && kind !== 'article'}<span class="count" class:over={limit && content.length > limit} aria-live="polite">{limit ? `${content.length}/${limit}` : content.length || ''}</span>{/if}
				{/snippet}
			</ComposerToolbar>
		</form>
		<p class="hint footer" data-sveltekit-reload>
			{#if data.draftsEnabled}Drafts stay in your private drafts repository and never reach the public site.{#if data.draft} Publishing removes this draft.{/if}{:else}Drafts are not configured, so posts can only be published.{/if}
			<a href={bookmarklet} title="Drag to your bookmarks bar to bookmark the page you are reading">Bookmarklet</a>
		</p>
	{/if}
</Page>

<style>
	:global(.compose-page) { max-width: 40rem; }
	[hidden] { display: none !important; }
	a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }



	.composer { display: flex; flex-direction: column; gap: var(--space-2); }
	input, select, textarea { font: inherit; color: var(--text-primary); }
	input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 1; }
	.title, .subtitle, .body, .target input { width: 100%; box-sizing: border-box; padding: 0; border: 0; background: transparent; outline: none; }
	.title { font-size: var(--fs-2xl); font-weight: var(--fw-semibold); line-height: var(--lh-tight); letter-spacing: var(--tracking-tight); }
	.title.small { font-size: var(--fs-lg); }
	.subtitle { color: var(--text-secondary); font-size: var(--fs-lg); }
	.body { min-height: 6rem; resize: none; font-size: var(--fs-lg); line-height: var(--lh-normal); field-sizing: content; }
	.body.long { min-height: 18rem; font-size: var(--fs-md); line-height: var(--lh-relaxed); }
	.body.mono { font-family: var(--font-mono); font-size: var(--fs-base); }
	.rich { margin: var(--space-1) 0; }
	.target { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: 999px; color: var(--text-muted); }
	.target:focus-within { border-color: var(--border-strong); color: var(--text-primary); }
	.target input { font-size: var(--fs-sm); }
	.grow { flex: 1; }
	.row { display: flex; align-items: center; gap: var(--space-2); }
	.panel.options { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); }
	.grid { display: grid; gap: var(--space-2) var(--space-3); }
	.grid.two { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
	.grid.three { grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); }
	.mini { display: flex; flex-direction: column; gap: var(--space-1); color: var(--text-muted); font-size: var(--fs-xs); }
	.mini input, .mini select { box-sizing: border-box; width: 100%; padding: 0.4rem 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: var(--fs-sm); }
	.mini input:focus, .mini select:focus { border-color: var(--border-strong); outline: none; }
	.check { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--fs-sm); }
	.leg { position: relative; margin: 0; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: var(--space-2); }
	.remove-leg { position: absolute; top: var(--space-1); right: var(--space-1); }
	.add { align-self: flex-start; }
	.panel.place { display: flex; flex-direction: column; gap: var(--space-2); }
	.body.quote { padding-left: var(--space-3); border-left: 2px solid var(--border-strong); font-style: italic; }
	.link { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
	.attachments li.wide { grid-column: 1 / -1; padding: var(--space-2) var(--space-6) var(--space-2) var(--space-2); }
	.attachments audio { width: 100%; }

	.segmented { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
	.segmented label { position: relative; cursor: pointer; }
	.segmented input, .stars input { position: absolute; opacity: 0; pointer-events: none; }
	.segmented span { display: inline-block; padding: var(--space-1) var(--space-3); border: 1px solid var(--border); border-radius: 999px; color: var(--text-secondary); font-size: var(--fs-sm); }
	.segmented input:checked + span { border-color: var(--text-primary); background: var(--text-primary); color: var(--bg-primary); }
	.segmented input:focus-visible + span { outline: 2px solid var(--text-primary); outline-offset: 2px; }
	.stars { display: flex; gap: var(--space-1); margin: 0; padding: 0; border: 0; }
	.stars label { color: var(--text-muted); cursor: pointer; }
	.stars label.on { color: var(--text-primary); }
	.stars label.on :global(svg) { fill: currentColor; }
	.stars label:focus-within { outline: 2px solid var(--text-primary); outline-offset: 2px; border-radius: var(--radius-sm); }

	.attachments { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--space-2); margin: var(--space-1) 0; padding: 0; list-style: none; }
	.attachments li { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-sunken); }
	.attachments img, .attachments video { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
	.alt { box-sizing: border-box; width: 100%; padding: var(--space-1) var(--space-2); border: 0; border-top: 1px solid var(--border-subtle); background: transparent; font-size: var(--fs-xs); outline: none; }
	.remove { position: absolute; top: var(--space-1); right: var(--space-1); display: flex; padding: var(--space-1); border: 0; border-radius: 999px; background: rgb(0 0 0 / 0.6); color: white; cursor: pointer; }

	.count { min-width: 2.5rem; color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; }
	.count.over { color: var(--text-primary); text-decoration: underline wavy; font-weight: var(--fw-semibold); }
	.hint { margin: var(--space-1) 0; color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.footer { margin-top: var(--space-4); font-size: var(--fs-xs); }
	.footer a { margin-left: var(--space-2); }
</style>
