<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ComposerBar from '$lib/components/composer/ComposerBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ComposerToolbar from '$lib/components/composer/ComposerToolbar.svelte';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import SyndicationList from '$lib/components/composer/SyndicationList.svelte';
	import AttachedPhotos from '$lib/components/editor/AttachedPhotos.svelte';
	import { Heading, Notice, Page, PageHeader, CheckboxGroup, ToggleChip } from '$lib/components/ui';
	import ThreadComposer from '$lib/components/composer/ThreadComposer.svelte';
	import QuotedPost from '$lib/components/composer/QuotedPost.svelte';
	import { characterCount, mentionQuery, altLength, PHOTO_LIMITS, type SocialService, type FollowedAccount } from '$lib/social-text';
	import { maxThreadPosts, splitIntoThread } from '$lib/social-thread';
	import follows from '$lib/data/social-follows.json';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// Absolute, so the link works whether or not the address ends in a slash.
	const postHref = $derived(`/${page.params.year}/${page.params.month}/${page.params.day}/${encodeURIComponent(page.params.slug ?? '')}/`);

	const kind = $derived(data.signedIn ? data.kind : 'post');

	const destinations = $derived(data.signedIn ? data.destinations : []);
	// Networks this post can still be sent to; the rest only show their status.
	const ready = $derived(destinations.filter(d => d.available && !d.pending && !d.links.length));
	const unrecorded = $derived(destinations.some(d => d.unrecorded));
	// Networks still open to send to are chosen in the toolbar, so the list only shows what already happened.
	const settled = $derived(destinations.filter(d => !ready.includes(d)));

	const initial = untrack(() => form?.drafts ?? Object.fromEntries(destinations.map(d => [d.service, d.thread])));
	// Start with every open network chosen: sending is what this page is for, and Post confirms it.
	let targets = $state<string[]>(untrack(() => form?.targets ?? ready.map(d => d.service)));
	let linked = $state(untrack(() => (form && 'linked' in form ? form.linked : true) ?? true));
	// Each network's thread, one entry per post. Linked, both start from Bluesky's, the shorter limit.
	let threads = $state<Record<string, string[]>>(untrack(() => {
		const own = Object.fromEntries(Object.entries(initial).map(([service, posts]) => [service, posts.length ? [...posts] : ['']]));
		const first = own.bluesky ?? own.mastodon ?? [''];
		return linked ? { ...own, bluesky: [...first], mastodon: [...first] } : own;
	}));
	const chosen = $derived(ready.filter(d => targets.includes(d.service)));
	// One shared thread while linked: the first chosen network's, sent to every chosen network.
	const shared = $derived(linked && chosen.length > 1);
	const editors = $derived(shared ? [chosen[0]] : chosen);
	// Networks a thread goes to: all chosen ones when shared.
	const reach = (service: SocialService) => shared ? chosen : chosen.filter(d => d.service === service);
	const limitOf = (service: SocialService) => Math.min(...reach(service).map(d => d.limit));
	// A shared post counts as the network it is closest to outgrowing would count it.
	const countFor = (service: SocialService) => (text: string) => Math.max(...reach(service).map(d => characterCount(text, d.service) * limitOf(service) / d.limit));
	const fitsFor = (service: SocialService) => (text: string) => countFor(service)(text) <= limitOf(service);

	let active = $state<{ service: SocialService; index: number } | null>(null);
	let query = $state<ReturnType<typeof mentionQuery>>(null);
	let field: HTMLTextAreaElement | null = null;
	const suggestions = $derived(query && active ? (follows.accounts as FollowedAccount[]).filter(a => a.service === active!.service && `${a.handle} ${a.name}`.toLowerCase().includes(query!.query)).slice(0, 8) : []);
	function track(service: SocialService, index: number, event: Event) {
		if (event instanceof KeyboardEvent && event.key === 'Escape') { query = null; return; }
		field = event.currentTarget as HTMLTextAreaElement;
		active = { service, index }; query = mentionQuery(field.value, field.selectionStart);
	}
	function insert(account: FollowedAccount) {
		if (!query || !active || !field) return;
		const end = query.start + account.handle.length + 2;
		const posts = threads[active.service], text = posts[active.index];
		posts[active.index] = text.slice(0, query.start) + '@' + account.handle + ' ' + text.slice(query.end);
		const target = field;
		query = null;
		setTimeout(() => { target.focus(); target.setSelectionRange(end, end); });
	}
	function toggleLinked() {
		// Both ways, every chosen network starts from the thread that was showing.
		const showing = chosen[0] ? [...threads[chosen[0].service]] : null;
		linked = !linked;
		if (showing) for (const other of chosen) threads[other.service] = [...showing];
	}
	// Splitting: long posts break where they are; a single post can become the whole text as a thread.
	const fullText = $derived(data.signedIn ? data.source : { text: '', link: '', stored: false });
	// Saving keeps the thread on the post, where Micropub clients read and edit it too.
	const canSave = $derived(fullText.stored || (!!editors[0] && (threads[editors[0].service] ?? []).length > 1));
	const tooLong = (service: SocialService) => threads[service].some(text => !fitsFor(service)(text));
	const canThreadAll = (service: SocialService) => threads[service].length === 1 && !!fullText.text && !fitsFor(service)(`${fullText.text}\n\n${fullText.link}`);
	function split(service: SocialService) {
		const fits = fitsFor(service);
		threads[service] = tooLong(service)
			? threads[service].flatMap(text => fits(text) ? [text] : splitIntoThread(text, fits)).slice(0, maxThreadPosts)
			: splitIntoThread(fullText.text, fits, fullText.link);
	}
	const thread = (service: SocialService) => threads[service] ?? [''];
	const counts = $derived(editors.map(d => ({ ...d, posts: thread(d.service).length, count: countFor(d.service)(thread(d.service)[0] ?? ''), limit: limitOf(d.service) })));
	// A single post shows its count in the toolbar; a thread shows each post's count beside it.
	const shown = $derived(counts.length === 1 && counts[0].posts === 1 ? counts : []);
	const over = $derived(editors.some(d => thread(d.service).some(text => !text.trim() || !fitsFor(d.service)(text))));

	// The post's photos go with the copies, up to each network's limit; after a failed send, the ones chosen then.
	const maxPhotos = Math.min(PHOTO_LIMITS.bluesky.count, PHOTO_LIMITS.mastodon.count);
	let photos = $state(untrack(() => (data.signedIn ? data.photos : []).map((photo, index) => {
		const chosen = form?.photos?.find(item => item.url === photo.url);
		// Photos start on the first post of a thread; each can move to another post.
		return { ...photo, alt: chosen?.alt ?? photo.alt, included: form?.photos ? !!chosen : index < maxPhotos, post: chosen?.post ?? photo.post ?? 0 };
	})));
	// Alt text fits every network it goes to.
	const altLimit = $derived(Math.min(...(chosen.length ? chosen : ready).map(d => PHOTO_LIMITS[d.service].alt)));
	// Photos of a post past the end of the thread go on its last post.
	const postCount = $derived(editors.length ? thread(editors[0].service).length : 1);
	const postOf = (photo: { post?: number }) => Math.min(photo.post ?? 0, postCount - 1);
	const photoField = $derived(JSON.stringify(photos.filter(photo => photo.included).map(photo => ({ url: photo.url, alt: photo.alt, post: postOf(photo) }))));
	const onPost = (index: number) => photos.filter(photo => postOf(photo) === index);
	const canMove = (photo: { post?: number; included?: boolean }, step: -1 | 1) => {
		const to = postOf(photo) + step;
		return to >= 0 && to < postCount && (!photo.included || onPost(to).filter(other => other.included).length < maxPhotos);
	};
	function move(photo: { post?: number }, step: -1 | 1) { photo.post = postOf(photo) + step; }
	// The networks this thread's first post quotes the reposted or quoted post on.
	const quoting = (service: SocialService) => data.signedIn && data.quote ? reach(service).filter(d => d.service === data.quote!.service).map(d => d.name) : [];
	const altOver = $derived(photos.some(photo => photo.included && altLength(photo.alt.trim()) > altLimit));

	let sending = $state(false);
	onMount(() => { if (data.signedIn) rememberOwner(true); });
</script>

<svelte:head><title>Syndicate {kind} — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main" class="compose-page">
	{#if !data.signedIn}
		<PageHeader trail={[{ label: 'Posts', href: '/posts/', icon: '📡' }, { label: 'Original post', href: postHref }]} tight><Heading level={1} size="display">Syndicate post</Heading></PageHeader>
		<OwnerSignIn message="Sign in to syndicate this post." />
	{:else}
		<ComposerBar>
			<Button variant="icon" icon="close" label="Back to the post" href={postHref} />
			<span class="kind"><Icon name="share" size={18} /> Syndicate {kind}</span>
			{#snippet actions()}
				<Button variant="icon" icon="article" label="Edit {kind}" href="{postHref}edit/" />
				{#if ready.length && canSave}<Button variant="quiet" type="submit" form="syndicate" name="intent" value="save" disabled={sending || over}>Save thread</Button>{/if}
				{#if ready.length}
					<Button variant="primary" type="submit" form="syndicate" name="intent" value="send" disabled={sending || !chosen.length || over || altOver}>{sending ? 'Posting…' : 'Post'}</Button>
				{/if}
			{/snippet}
		</ComposerBar>
		{#if form?.message}<Notice>{form.message}</Notice>{/if}
		<form id="syndicate" class="composer" method="POST" onsubmit={() => { sending = true; }}>
			<input type="hidden" name="csrf" value={data.csrf} />
			<input type="hidden" name="revision" value={data.revision} />
			{#if linked}<input type="hidden" name="linked" value="on" />{/if}
			<a class="title" href={postHref}>{data.title || data.postUrl}</a>

			{#if settled.length}
				<SyndicationList destinations={settled}>
					{#if unrecorded}
						<Button variant="quiet" type="submit" name="intent" value="sync" disabled={sending}>Save links to the post</Button>
					{/if}
				</SyndicationList>
			{/if}

			{#if ready.length}
				{#each chosen as destination (destination.service)}
					<!-- Every chosen network submits its thread, even while one shared thread is shown. -->
					{#if shared && destination !== chosen[0]}{#each thread(chosen[0].service) as text, index (index)}<input type="hidden" name={destination.service} value={text} />{/each}{/if}
				{/each}
				{#each editors as destination (destination.service)}
					<div class="draft">
						{#if !shared && chosen.length > 1}<div class="label"><label for="draft-{destination.service}-0">{destination.name}</label></div>{/if}
						<ThreadComposer bind:posts={threads[destination.service]} name={destination.service} id="draft-{destination.service}"
							label={shared || chosen.length === 1 ? 'Post text' : `${destination.name} post text`}
							limit={limitOf(destination.service)} count={countFor(destination.service)} max={maxThreadPosts}
							counts={!shared && chosen.length > 1 ? true : undefined}
							onsplit={tooLong(destination.service) || canThreadAll(destination.service) ? () => split(destination.service) : undefined}
							oninput={(index, event) => track(destination.service, index, event)}
							ontrack={(index, event) => track(destination.service, index, event)}>
							{#snippet below(index)}
								{#if active?.service === destination.service && active.index === index && query}
									<div class="mentions" role="group" aria-label="Mention suggestions">
										{#each suggestions as account (account.handle)}<Button variant="quiet" onclick={() => insert(account)}>{account.name} <span class="handle">@{account.handle}</span></Button>{/each}
										{#if !suggestions.length}<p class="hint">No matching followed accounts. You can type a full handle.</p>{/if}
									</div>
								{/if}
							{/snippet}
							{#snippet attachments(index)}
								{#if index === 0 && data.signedIn && data.quote && quoting(destination.service).length}
									<QuotedPost url={data.quote.url} networks={quoting(destination.service)} snapshot={data.quote.snapshot} />
								{/if}
								<!-- Photos are shared by every network; they show under the first one's posts. -->
								{#if destination === editors[0] && onPost(index).length}
									<AttachedPhotos bind:photos={() => onPost(index), () => {}} name={null} removable max={maxPhotos} {altLimit}
										onmove={postCount > 1 ? move : undefined} {canMove} />
								{/if}
							{/snippet}
						</ThreadComposer>
					</div>
				{:else}
					<p class="hint">Choose where to post.</p>
				{/each}
				{#if photos.length}<input type="hidden" name="photos" value={photoField} />{/if}
				<ComposerToolbar label="Post to">
					<CheckboxGroup layout="row" label="Post to" name="targets" bind:value={targets}>
						{#each ready as destination (destination.service)}
							<ToggleChip value={destination.service} title="Post to {destination.name}">{destination.name}</ToggleChip>
						{/each}
					</CheckboxGroup>
					{#if chosen.length > 1}<Button variant="icon" icon="link" label={linked ? 'Text is shared. Edit each separately' : 'Share one text'} pressed={linked} onclick={toggleLinked} />{/if}
					{#snippet end()}
						{#each shown as destination (destination.service)}
							<span class="count" class:over={destination.count > destination.limit} title={destination.name}>{destination.count}/{destination.limit}</span>
						{/each}
					{/snippet}
				</ComposerToolbar>
			{/if}
		</form>
		<p class="hint footer">
			{#if ready.length}Posts share text, up to {maxPhotos} photos each and a link back. A thread goes out as replies to its first post, and every post’s link is saved on the post. Alt text edited here is saved to the post too. Mentions use each network’s handles.{/if}
			Only sends from this site and links saved on the post appear here.
		</p>
	{/if}
</Page>

<style>
	:global(.compose-page) { max-width: 40rem; }
	.kind { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2); color: var(--text-primary); font-size: var(--fs-sm); font-weight: var(--fw-medium); }
	.composer { display: flex; flex-direction: column; gap: var(--space-3); }
	.title { color: var(--text-primary); font-size: var(--fs-2xl); font-weight: var(--fw-semibold); line-height: var(--lh-tight); letter-spacing: var(--tracking-tight); text-decoration: none; overflow-wrap: anywhere; }
	@media (hover: hover) { .title:hover { text-decoration: underline; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); } }
	.draft { display: flex; flex-direction: column; gap: var(--space-1); }
	.label { display: flex; justify-content: space-between; align-items: baseline; color: var(--text-muted); font-size: var(--fs-xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
	.mentions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
	.handle { color: var(--text-muted); }
	.count { min-width: 2.5rem; color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; }
	.count.over { color: var(--text-primary); text-decoration: underline wavy; font-weight: var(--fw-semibold); }
	.hint { margin: var(--space-1) 0; color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.footer { margin-top: var(--space-4); font-size: var(--fs-xs); }
</style>
