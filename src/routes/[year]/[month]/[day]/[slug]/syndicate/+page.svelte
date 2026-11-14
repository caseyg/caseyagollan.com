<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { rememberOwner } from '$lib/owner';
	import Icon from '$lib/components/composer/ComposerIcon.svelte';
	import ComposerBar from '$lib/components/composer/ComposerBar.svelte';
	import ComposerButton from '$lib/components/composer/ComposerButton.svelte';
	import ComposerChip from '$lib/components/composer/ComposerChip.svelte';
	import ComposerToolbar from '$lib/components/composer/ComposerToolbar.svelte';
	import OwnerSignIn from '$lib/components/composer/OwnerSignIn.svelte';
	import SyndicationList from '$lib/components/composer/SyndicationList.svelte';
	import { Heading, Notice, Page, PageHeader } from '$lib/components/ui';
	import { characterCount, mentionQuery, type SocialService, type FollowedAccount } from '$lib/social-text';
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

	const initial = untrack(() => form?.drafts ?? Object.fromEntries(destinations.map(d => [d.service, d.draft])));
	// Start with every open network chosen: sending is what this page is for, and Post confirms it.
	let targets = $state<string[]>(untrack(() => form?.targets ?? ready.map(d => d.service)));
	let linked = $state(untrack(() => (form && 'linked' in form ? form.linked : true) ?? true));
	let drafts = $state<Record<string, string>>(untrack(() => ({ ...initial, ...(linked ? { mastodon: initial.bluesky ?? initial.mastodon ?? '' } : {}) })));
	const chosen = $derived(ready.filter(d => targets.includes(d.service)));
	// One shared draft while linked; it starts from Bluesky's, the shorter limit.
	const shared = $derived(linked && chosen.length > 1);
	const editors = $derived(shared ? [chosen[0]] : chosen);

	let active = $state<SocialService | null>(null);
	let query = $state<ReturnType<typeof mentionQuery>>(null);
	let field: HTMLTextAreaElement | null = null;
	const suggestions = $derived(query && active ? (follows.accounts as FollowedAccount[]).filter(a => a.service === active && `${a.handle} ${a.name}`.toLowerCase().includes(query!.query)).slice(0, 8) : []);
	function set(service: SocialService, value: string) {
		drafts[service] = value;
		if (shared) for (const other of chosen) drafts[other.service] = value;
	}
	function track(service: SocialService, event: Event) {
		field = event.currentTarget as HTMLTextAreaElement;
		active = service; query = mentionQuery(field.value, field.selectionStart);
	}
	function insert(account: FollowedAccount) {
		if (!query || !active || !field) return;
		const end = query.start + account.handle.length + 2;
		set(active, drafts[active].slice(0, query.start) + '@' + account.handle + ' ' + drafts[active].slice(query.end));
		const target = field;
		query = null;
		setTimeout(() => { target.focus(); target.setSelectionRange(end, end); });
	}
	function toggleLinked() {
		linked = !linked;
		if (linked && chosen[0]) for (const other of chosen) drafts[other.service] = drafts[chosen[0].service];
	}
	const counts = $derived(chosen.map(d => ({ ...d, count: characterCount(drafts[d.service] ?? '', d.service) })));
	// A shared draft shows one count: the network it is closest to outgrowing.
	// Separate drafts show their counts beside their own labels instead.
	const shown = $derived(shared ? [counts.reduce((a, b) => b.count / b.limit > a.count / a.limit ? b : a)] : counts.length === 1 ? counts : []);
	const countOf = (service: string) => counts.find(d => d.service === service);
	const over = $derived(counts.some(d => d.count > d.limit || !d.count));

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
			<ComposerButton variant="icon" icon="close" label="Back to the post" href={postHref} />
			<span class="kind"><Icon name="share" size={18} /> Syndicate {kind}</span>
			{#snippet actions()}
				<ComposerButton variant="icon" icon="article" label="Edit {kind}" href="{postHref}edit/" />
				{#if ready.length}
					<ComposerButton variant="primary" type="submit" form="syndicate" name="intent" value="send" disabled={sending || !chosen.length || over}>{sending ? 'Posting…' : 'Post'}</ComposerButton>
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
						<ComposerButton type="submit" name="intent" value="sync" disabled={sending}>Save links to the post</ComposerButton>
					{/if}
				</SyndicationList>
			{/if}

			{#if ready.length}
				{#each chosen as destination (destination.service)}
					<!-- Every chosen network submits its draft, even while one shared field is shown. -->
					{#if shared && destination !== chosen[0]}<input type="hidden" name={destination.service} value={drafts[destination.service]} />{/if}
				{/each}
				{#each editors as destination (destination.service)}
					<div class="draft">
						{#if !shared && chosen.length > 1}{@const own = countOf(destination.service)}<div class="label"><label for="draft-{destination.service}">{destination.name}</label>{#if own}<span class="count" class:over={own.count > own.limit}>{own.count}/{own.limit}</span>{/if}</div>{/if}
						<textarea id="draft-{destination.service}" class="body" name={destination.service} rows="4"
							aria-label={shared ? 'Post text' : `${destination.name} post text`}
							value={drafts[destination.service]}
							oninput={(event) => { set(destination.service, event.currentTarget.value); track(destination.service, event); }}
							onclick={(event) => track(destination.service, event)}
							onkeyup={(event) => { if (event.key === 'Escape') { query = null; return; } track(destination.service, event); }}></textarea>
						{#if active === destination.service && query}
							<div class="mentions" role="group" aria-label="Mention suggestions">
								{#each suggestions as account (account.handle)}<ComposerButton onclick={() => insert(account)}>{account.name} <span class="handle">@{account.handle}</span></ComposerButton>{/each}
								{#if !suggestions.length}<p class="hint">No matching followed accounts. You can type a full handle.</p>{/if}
							</div>
						{/if}
					</div>
				{:else}
					<p class="hint">Choose where to post.</p>
				{/each}
				<ComposerToolbar label="Post to">
					<span class="share" role="group" aria-label="Post to">
						{#each ready as destination (destination.service)}
							<ComposerChip name="targets" value={destination.service} bind:group={targets} title="Post to {destination.name}">{destination.name}</ComposerChip>
						{/each}
					</span>
					{#if chosen.length > 1}<ComposerButton variant="icon" icon="link" label={linked ? 'Text is shared. Edit each separately' : 'Share one text'} pressed={linked} onclick={toggleLinked} />{/if}
					{#snippet end()}
						{#each shown as destination (destination.service)}
							<span class="count" class:over={destination.count > destination.limit} title={destination.name}>{destination.count}/{destination.limit}</span>
						{/each}
					{/snippet}
				</ComposerToolbar>
			{/if}
		</form>
		<p class="hint footer">
			{#if ready.length}Posts share text and a link back; photos stay on the original page. Mentions use each network’s handles.{/if}
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
	.body { box-sizing: border-box; width: 100%; min-height: 6rem; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: var(--fs-lg); line-height: var(--lh-normal); resize: none; outline: none; field-sizing: content; }
	.body::placeholder { color: var(--text-muted); opacity: 1; }
	.mentions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
	.handle { color: var(--text-muted); }
	.share { display: inline-flex; gap: var(--space-1); margin-right: var(--space-1); }
	.count { min-width: 2.5rem; color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; }
	.count.over { color: var(--text-primary); text-decoration: underline wavy; font-weight: var(--fw-semibold); }
	.hint { margin: var(--space-1) 0; color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
	.footer { margin-top: var(--space-4); font-size: var(--fs-xs); }
</style>
