<script lang="ts">
 import type { PageData, ActionData } from './$types';
 let { data, form }: { data: PageData; form: ActionData } = $props();
 import { Button, Checkbox, Heading, Notice, Page, PageHeader, Section, TextField } from '$lib/components/ui';
 let sending = $state(false);
</script>

<svelte:head><title>Syndicate post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<Page as="main" width="wide">
 <PageHeader backHref="../" backText="Original post" tight>
  <Heading level={1} size="display">Syndicate post</Heading>
 </PageHeader>
 {#if !data.signedIn}
  <p><a href="/account" target="_blank" rel="noopener">Sign in with your passkey</a>, then <button class="reload" type="button" onclick={() => location.reload()}>reload this page</button> to syndicate the post.</p>
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
 .reload { padding: 0; color: inherit; background: none; border: 0; font: inherit; text-decoration: underline; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); cursor: pointer; }
</style>
