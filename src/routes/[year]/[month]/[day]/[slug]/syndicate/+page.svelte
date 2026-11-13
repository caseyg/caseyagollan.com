<script lang="ts">
 import { onMount } from 'svelte';
 import { page } from '$app/state';
 import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
 import { passkeyError, signInWithPasskey } from '$lib/passkey-login';
 import type { PageData, ActionData } from './$types';
 let { data, form }: { data: PageData; form: ActionData } = $props();
 import { Button, Checkbox, Heading, Notice, Page, PageHeader, Section, TextField } from '$lib/components/ui';
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
      <TextField multiline label="Draft · maximum {destination.limit} characters" id={destination.service} name={destination.service} rows={8} value={form?.drafts?.[destination.service] ?? destination.draft} />
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
 .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
</style>
