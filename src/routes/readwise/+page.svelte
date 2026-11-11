<script lang="ts">
 import { onMount } from 'svelte';
 import type { PageData } from './$types';
 import type { Candidate } from '$lib/server/readwise';
 import { Button, Checkbox, Chip, Heading, Notice, Page, TextField } from '$lib/components/ui';
 let { data }: { data: PageData } = $props();
 let items = $state<Candidate[]>([]);
 let selected = $state<string[]>([]);
 let cursor = $state<string | null>(null);
 let loaded = $state(false);
 let busy = $state(false);
 let message = $state('');
 let failure = $state('');
 let imported = $state<Record<string, string>>({});
 let tagDraft = $state<Record<string, string>>({});
 const pending = $derived(items.filter(item => !imported[item.id]));
 const tagOptions = $derived([...new Set([...data.tags, ...items.flatMap(item => item.tags)])].sort());
 function addTag(item: Candidate) {
  const tag = (tagDraft[item.id] || '').trim();
  if (tag && tag.length <= 100 && item.tags.length < 50 && !item.tags.includes(tag)) item.tags = [...item.tags, tag];
  tagDraft[item.id] = '';
 }
 const groups = $derived([...new Set(items.map(i => i.day))].sort().reverse().map(day => ({ day, items: items.filter(i => i.day === day), pending: items.filter(i => i.day === day && !imported[i.id]) })));
 const checked = (list: Candidate[]) => list.length > 0 && list.every(i => selected.includes(i.id));
 function toggle(list: Candidate[], on: boolean) {
  const ids = new Set(list.filter(i => !imported[i.id]).map(i => i.id));
  selected = on ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.has(id));
 }
 async function api<T>(path: string, body?: unknown) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again at /account.' : result.message || 'Request failed. Please retry.');
  return result;
 }
 async function loadMore() {
  if (busy) return;
  busy = true; failure = '';
  try {
   const page = await api<{ items: Candidate[]; cursor: string | null }>('/readwise/api' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
   const known = new Set(items.map(i => i.id));
   items = [...items, ...page.items.filter((i: Candidate) => !known.has(i.id))];
   cursor = page.cursor; loaded = true;
  } catch (e) { failure = e instanceof Error ? e.message : 'Could not load Readwise.'; }
  finally { busy = false; }
 }
 async function act(action: 'import' | 'dismiss', list: Candidate[]) {
  list = list.filter(item => !imported[item.id]);
  if (busy || !list.length) return;
  busy = true; failure = ''; message = '';
  let count = 0;
  try {
   // Bound each request; a selected day may span several batches.
   for (let offset = 0; offset < list.length; offset += 10) {
    const batch = list.slice(offset, offset + 10);
    const result = await api<{ results: { id: string; ok: boolean; url?: string }[] }>('/readwise/api', { action, csrf: data.csrf, items: action === 'dismiss' ? batch.map(i => ({ id: i.id })) : batch.map(i => ({ id: i.id, url: i.url, title: i.title, savedAt: i.savedAt, summary: i.summary, tags: i.tags })) });
    const done = new Set<string>(result.results.filter((r: { ok: boolean }) => r.ok).map((r: { id: string }) => r.id));
    count += done.size;
    if (action === 'import') {
     for (const receipt of result.results) if (receipt.ok && receipt.url) imported[receipt.id] = receipt.url;
    } else items = items.filter(i => !done.has(i.id));
    selected = selected.filter(id => !done.has(id));
    if (result.results.some((r: { ok: boolean }) => !r.ok)) throw new Error('Some imports could not finish. Remaining items are still selected; retry safely.');
   }
  } catch (e) { failure = e instanceof Error ? e.message : 'Request failed. Retry safely.'; }
  finally { message = `${count} ${action === 'import' ? 'bookmarks published' : 'items dismissed'}.`; busy = false; }
 }
 onMount(() => { void loadMore(); });
</script>

<svelte:head><title>Readwise · Casey Gollan</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<Page as="main" width="wide" class="readwise">
 <nav><a href="/">Casey Gollan</a><a href="/account">Account</a></nav>
 <header><Heading as="p" size="label">Private import queue</Heading><Heading level={1} size="display">Readwise</Heading>
 <p class="muted">Choose what belongs on your site. Previews stay private until you import.</p></header>
 <details class="help"><summary>What gets imported?</summary><aside>Imports publish the title, URL, summary below, and selected tags, dated when saved to Reader. Personal notes are never imported. Days use America/New_York time. Day controls apply to loaded items. Dismissals save only Readwise IDs.</aside></details>
 <div class="toolbar">
  <Checkbox disabled={busy || !pending.length} checked={checked(pending)} indeterminate={selected.length > 0 && !checked(pending)} onchange={(e: Event & { currentTarget: HTMLInputElement }) => toggle(pending, e.currentTarget.checked)}>Select all loaded</Checkbox>
  <Button size="sm" variant="primary" disabled={busy || !selected.length} onclick={() => act('import', items.filter(i => selected.includes(i.id)))}>Import selected · {selected.length}</Button>
  <Button size="sm" disabled={busy || !selected.length} onclick={() => act('dismiss', items.filter(i => selected.includes(i.id)))}>Dismiss selected</Button>
 </div>
 <datalist id="existing-tags">{#each tagOptions as tag}<option value={tag}></option>{/each}</datalist>
 <div class="status" aria-live="polite">{#if message}<p>{message}</p>{/if}{#if busy}<p>Working…</p>{/if}</div>
 {#if failure}<Notice tone="error">{failure}</Notice>{/if}
 {#each groups as group (group.day)}
  <section>
   <div class="day"><Checkbox disabled={busy || !group.pending.length} checked={checked(group.pending)} indeterminate={group.pending.some(i => selected.includes(i.id)) && !checked(group.pending)} onchange={(e: Event & { currentTarget: HTMLInputElement }) => toggle(group.pending, e.currentTarget.checked)}><strong>{group.day}</strong></Checkbox><span>{group.pending.length} pending · {group.items.length - group.pending.length} imported</span><Button size="sm" disabled={busy || !group.pending.length} onclick={() => act('dismiss', group.pending)}>Dismiss day</Button></div>
   {#each group.items as item (item.id)}
    <article>
     {#if imported[item.id]}
      <div class="preview"><p class="source">Imported</p><h2><a href={imported[item.id]}>{item.title}</a></h2><p><a href={imported[item.id]}>View post →</a></p></div>
     {:else}
     <Checkbox aria-label={`Select ${item.title}`} disabled={busy} checked={selected.includes(item.id)} onchange={(e: Event & { currentTarget: HTMLInputElement }) => toggle([item], e.currentTarget.checked)} />
     <div class="preview"><p class="source">{new URL(item.url).hostname} · {item.category}</p><h2><a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a></h2><details class="item-details"><summary>Edit details <span class="detail-hint">· summary &amp; tags{item.tags.length ? ` · ${item.tags.length} ${item.tags.length === 1 ? 'tag' : 'tags'}` : ''}</span></summary>{#if item.author}<p class="author">{item.author}</p>{/if}<TextField multiline label="Summary" maxlength={4000} disabled={busy} bind:value={item.summary} />
      <div class="tags">{#each item.tags as tag}<Chip variant="soft" disabled={busy} aria-label={`Remove tag ${tag}`} onclick={() => item.tags = item.tags.filter(t => t !== tag)}>{tag} ×</Chip>{/each}</div>
      <TextField label="Add tag" list="existing-tags" maxlength={100} disabled={busy} bind:value={tagDraft[item.id]} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addTag(item); } }} /><Button size="sm" disabled={busy || !tagDraft[item.id]?.trim()} onclick={() => addTag(item)}>Add tag</Button><p class="url"><a href={item.url} target="_blank" rel="noreferrer noopener">{item.url}</a></p></details></div>
     <Button size="sm" disabled={busy} aria-label={`Dismiss ${item.title}`} onclick={() => act('dismiss', [item])}>Dismiss</Button>
     {/if}
    </article>
   {/each}
  </section>
 {/each}
 {#if loaded && !items.length}<p>{cursor ? 'No pending bookmarks on this page. Continue loading to review more.' : 'You’re all caught up. No pending bookmarks.'}</p>{/if}
 {#if cursor || !loaded}<div class="more"><Button disabled={busy} onclick={loadMore}>{loaded ? 'Load more from Readwise' : 'Load Readwise'}</Button></div>{/if}
</Page>
<style>
 /* A dense working view: one step down the type scale from reading pages. */
 :global(.readwise) { font-size: var(--fs-sm); line-height: var(--lh-normal); }
 nav { display: flex; justify-content: space-between; }
 a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
 header { margin: var(--space-6) 0 var(--space-3); }
 header :global(.heading--display) { margin: var(--space-1) 0 var(--space-2); }
 .muted, .source, .author, .url, .detail-hint { color: var(--text-muted); }
 p { margin: var(--space-1) 0; }
 .help { margin-bottom: var(--space-3); font-size: var(--fs-xs); }
 summary { width: fit-content; cursor: pointer; }
 summary:hover { color: var(--text-primary); }
 aside { max-width: 42rem; margin: var(--space-2) 0; color: var(--text-secondary); }
 .toolbar { position: sticky; top: 0; z-index: var(--z-sticky); display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); background: var(--bg-primary); }
 .status p { color: var(--text-secondary); }
 .day { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin-top: var(--space-4); padding: var(--space-2) 0; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
 .day span { flex: 1; color: var(--text-muted); }
 article { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border-subtle); }
 .preview { flex: 1; min-width: 0; }
 h2 { margin: 2px 0; font-size: var(--fs-base); font-weight: var(--fw-regular); line-height: var(--lh-snug); text-wrap: pretty; }
 h2 a { text-decoration: none; }
 h2 a:hover { text-decoration: underline; }
 .source { margin: 0; font-size: var(--fs-2xs); letter-spacing: var(--tracking-wide); }
 .author { font-size: var(--fs-xs); }
 .item-details { margin-top: var(--space-1); font-size: var(--fs-xs); }
 .item-details[open] { margin-top: var(--space-2); }
 .url { margin-top: var(--space-3); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
 .tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
 .more { margin-top: var(--space-4); }
 @media (max-width: 600px) {
  header { margin-top: var(--space-5); }
  .toolbar { gap: var(--space-2); font-size: var(--fs-xs); }
  .toolbar :global(.checkbox) { flex-basis: 100%; }
  article { gap: var(--space-2); }
  .detail-hint { display: none; }
  .day { gap: var(--space-1) var(--space-3); }
 }
</style>
