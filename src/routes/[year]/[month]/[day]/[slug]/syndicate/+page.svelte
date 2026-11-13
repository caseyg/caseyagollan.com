<script lang="ts">
 import { onMount } from 'svelte';
 import { page } from '$app/state';
 import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
 import { passkeyError, signInWithPasskey } from '$lib/passkey-login';
 import type { PageData, ActionData } from './$types';
 let { data, form }: { data: PageData; form: ActionData } = $props();
 import { Button, Checkbox, Heading, Notice, Page, PageHeader, Section, TextField } from '$lib/components/ui';
 import { characterCount, mentionQuery, type SocialService, type FollowedAccount } from '$lib/social-text';
 import follows from '$lib/data/social-follows.json';
 const initiallyLinked = form && 'linked' in form ? form.linked : !form?.drafts;
 let linked = $state(initiallyLinked);
 const initial = form?.drafts ?? Object.fromEntries((data.destinations ?? []).map(d => [d.service, d.draft]));
 let drafts = $state<Record<string,string>>({ ...initial, ...(initiallyLinked ? { mastodon: initial.bluesky ?? initial.mastodon ?? '' } : {}) });
 let active = $state<SocialService | null>(null);
 let query = $state<ReturnType<typeof mentionQuery>>(null);
 let field: HTMLTextAreaElement | null = null;
 const suggestions = $derived(query && active ? (follows.accounts as FollowedAccount[]).filter(a => a.service === active && `${a.handle} ${a.name}`.toLowerCase().includes(query!.query)).slice(0,8) : []);
 function edit(service: SocialService, event: Event) {
  field = event.target as HTMLTextAreaElement;
  drafts[service] = field.value;
  if (linked) drafts[service === 'bluesky' ? 'mastodon' : 'bluesky'] = field.value;
  active = service; query = mentionQuery(field.value, field.selectionStart);
 }
 function insert(account: FollowedAccount) {
  if (!query || !active || !field) return;
  const end = query.start + account.handle.length + 2;
  drafts[active] = drafts[active].slice(0,query.start) + '@' + account.handle + ' ' + drafts[active].slice(query.end);
  if (linked) drafts[active === 'bluesky' ? 'mastodon' : 'bluesky'] = drafts[active];
  const target = field;
  query = null;
  setTimeout(() => { target.focus(); target.setSelectionRange(end,end); });
 }
 let sending = $state(false);
 let signingIn = $state(false);
 let signInError = $state('');
 let passkeysSupported = $state(false);
 let ready = $state(false);
 onMount(() => { passkeysSupported = browserSupportsWebAuthn(); ready = true; });
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

<svelte:head><title>Syndicate post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main" width="wide">
 <PageHeader backHref="../" backText="Original post" tight>
  <Heading level={1} size="display">Syndicate post</Heading>
 </PageHeader>
 {#if !data.signedIn}
  <p>Sign in to syndicate this post.</p>
  {#if signInError}<Notice tone="error">{signInError}</Notice>{/if}
  {#if ready && !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in.</Notice>{/if}
  <Button variant="primary" disabled={signingIn || !passkeysSupported} onclick={login}>{signingIn ? 'Signing in…' : 'Sign in with passkey'}</Button>
  <noscript><p>Enable JavaScript to sign in with your passkey.</p></noscript>
 {:else}
  <p class="lede">{data.title || data.postUrl}</p>
  <p class="hint">Choose either destination or both. Edit the text before sending. These posts share text and a link; media stays on the original page.</p>
  <p class="hint">Checks saved syndication links and previous sends. Copies posted independently may not be recorded here.</p>
  {#if form?.message}<Notice>{form.message}</Notice>{/if}
  <form method="POST" onsubmit={() => { sending = true; }}>
   <input type="hidden" name="csrf" value={data.csrf} />
   <input type="hidden" name="revision" value={data.revision} />
   <Checkbox name="linked" checked={linked} onchange={(event: Event) => {
    linked = (event.target as HTMLInputElement).checked;
    if (linked) drafts.mastodon = drafts.bluesky;
   }}>Keep text in sync</Checkbox>
   <p class="hint">Turn off to edit each post separately. Turning on copies the Bluesky draft to Mastodon. Mentions use each network’s handles.</p>
   {#each data.destinations ?? [] as destination (destination.service)}
    <Section title={destination.name} variant="card">
     {#if destination.links.length}
      {#each destination.links as link}<p>Already syndicated: <a href={link} target="_blank" rel="noopener noreferrer">View post ↗</a></p>{/each}
     {:else if destination.pending}
      <p>A previous send is in progress or needs review. Check your social account before retrying.</p>
     {:else if !destination.available}
      <p>This destination is not configured yet.</p>
     {:else}
      <Checkbox name="targets" value={destination.service} checked={form?.targets?.includes(destination.service) ?? false}>Send to {destination.name}</Checkbox>
      <TextField multiline label="Draft · maximum {destination.limit} characters" id={destination.service} name={destination.service} rows={8} value={drafts[destination.service]} oninput={(event: Event) => edit(destination.service, event)} onkeyup={(event: KeyboardEvent) => { if (event.key === 'Escape') { query = null; return; } field = event.target as HTMLTextAreaElement; active = destination.service; query = mentionQuery(field.value, field.selectionStart); }} onclick={(event: MouseEvent) => { field = event.target as HTMLTextAreaElement; active = destination.service; query = mentionQuery(field.value, field.selectionStart); }} />
      {@const count = characterCount(drafts[destination.service] ?? '', destination.service)}
      <p class="hint" class:over={count > destination.limit} role="status">{count} / {destination.limit}{count > destination.limit ? ` · ${count - destination.limit} over limit` : ` · ${destination.limit - count} remaining`}</p>
      {#if active === destination.service && query}
       <div class="mentions" aria-label="Mention suggestions">
        {#each suggestions as account}<button type="button" onclick={() => insert(account)}>{account.name} <span>@{account.handle}</span></button>{/each}
        {#if !suggestions.length}<p class="hint">No matching followed accounts. You can type a full handle.</p>{/if}
       </div>
      {/if}
     {/if}
    </Section>
   {/each}
   <div class="actions">
    <Button type="submit" variant="primary" name="intent" value="send" disabled={sending || !data.destinations?.some(d => d.available && !d.pending && !d.links.length)}>{sending ? 'Sending…' : 'Send selected posts'}</Button>
    {#if data.destinations?.some(d => d.links.length)}<Button type="submit" name="intent" value="sync" disabled={sending}>Sync links to original post</Button>{/if}
   </div>
  </form>
 {/if}
</Page>

<style>
 p, a { overflow-wrap: anywhere; }
 a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
 .lede { font-size: var(--fs-md); }
 .hint { color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); margin: var(--space-2) 0; max-width: 40rem; }
 .over { color: var(--text-primary); font-weight: 700; }
 .mentions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
 .mentions button { font: inherit; color: inherit; background: var(--surface-sunken); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: var(--space-2); cursor: pointer; }
 .mentions span { color: var(--text-muted); }
 .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
</style>
