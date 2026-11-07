<script lang="ts">
 import type { PageData, ActionData } from './$types';
 let { data, form }: { data: PageData; form: ActionData } = $props();
 let sending = $state(false);
</script>

<svelte:head><title>Syndicate post — Casey Gollan</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<main>
 <a href="../">← Original post</a>
 <h1>Syndicate post</h1>
 {#if !data.signedIn}
  <p><a href="/account" target="_blank" rel="noopener">Sign in with your passkey</a>, then <button class="reload" type="button" onclick={() => location.reload()}>reload this page</button> to syndicate the post.</p>
 {:else}
  <p>{data.title || data.postUrl}</p>
  <p class="hint">Choose either destination or both. Edit the text before sending. These posts share text and a link; media stays on the original page.</p>
  <p class="hint">Checks saved syndication links and previous sends. Copies posted independently may not be recorded here.</p>
  {#if form?.message}<aside role="status">{form.message}</aside>{/if}
  <form method="POST" onsubmit={() => { sending = true; }}>
   <input type="hidden" name="csrf" value={data.csrf} />
   <input type="hidden" name="revision" value={data.revision} />
   {#each data.destinations ?? [] as destination (destination.service)}
    <section>
     <h2>{destination.name}</h2>
     {#if destination.links.length}
      {#each destination.links as link}<p>Already syndicated: <a href={link} target="_blank" rel="noopener noreferrer">View post ↗</a></p>{/each}
     {:else if destination.pending}
      <p>A previous send is in progress or needs review. Check your social account before retrying.</p>
     {:else if !destination.available}
      <p>This destination is not configured yet.</p>
     {:else}
      <label><input type="checkbox" name="targets" value={destination.service} checked={form?.targets?.includes(destination.service) ?? false} /> Send to {destination.name}</label>
      <label class="draft-label" for={destination.service}>Draft · maximum {destination.limit} characters</label>
      <textarea id={destination.service} name={destination.service} rows="8" value={form?.drafts?.[destination.service] ?? destination.draft}></textarea>
     {/if}
    </section>
   {/each}
   <div class="actions">
    <button type="submit" name="intent" value="send" disabled={sending || !data.destinations?.some(d => d.available && !d.pending && !d.links.length)}>{sending ? 'Sending…' : 'Send selected posts'}</button>
    {#if data.destinations?.some(d => d.links.length)}<button type="submit" name="intent" value="sync" disabled={sending}>Sync links to original post</button>{/if}
   </div>
  </form>
 {/if}
</main>

<style>
 main { max-width: 46rem; margin: 3rem auto; padding: 0 1rem 3rem; font-size: 1rem; font-weight: 400; line-height: 1.5; }
 h1 { margin: 1rem 0; font-size: 2.5rem; line-height: 1.2; } h2 { margin-top: 0; font-size: 1.5rem; }
 p, a { overflow-wrap: anywhere; }
 a { color: inherit; text-underline-offset: .15em; }
 .hint { opacity: .7; font-size: .95rem; }
 section { border: 1px solid #ffffff40; border-radius: .5rem; padding: 1.25rem; margin: 1.5rem 0; }
 label { display: block; } input[type='checkbox'] { margin-right: .4rem; }
 .draft-label { margin: 1rem 0 .4rem; }
 textarea { width: 100%; box-sizing: border-box; padding: .75rem; font: inherit; color: inherit; background: #ffffff0a; border: 1px solid #ffffff60; border-radius: .25rem; }
 aside { border-left: 3px solid currentColor; padding: 1rem; margin: 1.5rem 0; }
 .actions { display: flex; gap: 1rem; flex-wrap: wrap; }
 button { padding: .75rem 1rem; font: inherit; cursor: pointer; }
 .reload { padding: 0; color: inherit; background: none; border: 0; text-decoration: underline; }
 button:disabled { cursor: default; opacity: .5; }
</style>
