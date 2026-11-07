<script lang="ts">
 import { onMount } from 'svelte';
 import type { PageData } from './$types';
 import type { Candidate } from '$lib/server/readwise';
 let { data }: { data: PageData } = $props();
 let items = $state<Candidate[]>([]);
 let selected = $state<string[]>([]);
 let cursor = $state<string | null>(null);
 let loaded = $state(false);
 let busy = $state(false);
 let message = $state('');
 let failure = $state('');
 const groups = $derived([...new Set(items.map(i => i.day))].sort().reverse().map(day => ({ day, items: items.filter(i => i.day === day) })));
 const checked = (list: Candidate[]) => list.length > 0 && list.every(i => selected.includes(i.id));
 function toggle(list: Candidate[], on: boolean) {
  const ids = new Set(list.map(i => i.id));
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
  if (busy || !list.length) return;
  busy = true; failure = ''; message = '';
  let count = 0;
  try {
   // Bound each request; a selected day may span several batches.
   for (let offset = 0; offset < list.length; offset += 10) {
    const batch = list.slice(offset, offset + 10);
    const result = await api<{ results: { id: string; ok: boolean }[] }>('/readwise/api', { action, csrf: data.csrf, items: action === 'dismiss' ? batch.map(i => ({ id: i.id })) : batch.map(i => ({ id: i.id, url: i.url, title: i.title, savedAt: i.savedAt })) });
    const done = new Set<string>(result.results.filter((r: { ok: boolean }) => r.ok).map((r: { id: string }) => r.id));
    count += done.size;
    items = items.filter(i => !done.has(i.id)); selected = selected.filter(id => !done.has(id));
    if (result.results.some((r: { ok: boolean }) => !r.ok)) throw new Error('Some imports could not finish. Remaining items are still selected; retry safely.');
   }
  } catch (e) { failure = e instanceof Error ? e.message : 'Request failed. Retry safely.'; }
  finally { message = `${count} ${action === 'import' ? 'bookmarks published' : 'items dismissed'}.`; busy = false; }
 }
 onMount(() => { void loadMore(); });
</script>

<svelte:head><title>Readwise · Casey Gollan</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<main>
 <nav><a href="/">Casey Gollan</a><a href="/account">Account</a></nav>
 <header><p class="eyebrow">PRIVATE IMPORT QUEUE</p><h1>Readwise</h1>
 <p>Choose what belongs on your site.</p>
 <p class="muted">Previews stay private. Nothing is published until you click <strong>Import selected</strong>. Dismissals save only Readwise IDs.</p></header>
 <aside>Imports publish the title and URL, dated when saved to Reader. Summaries and personal notes are never imported. Days use America/New_York time. Day controls apply to loaded items.</aside>
 <div class="toolbar">
  <label><input type="checkbox" disabled={busy || !items.length} checked={checked(items)} indeterminate={selected.length > 0 && !checked(items)} onchange={e => toggle(items, e.currentTarget.checked)} /> Select all loaded</label>
  <span>{selected.length} selected</span>
  <button class="primary" disabled={busy || !selected.length} onclick={() => act('import', items.filter(i => selected.includes(i.id)))}>Import selected · {selected.length}</button>
  <button disabled={busy || !selected.length} onclick={() => act('dismiss', items.filter(i => selected.includes(i.id)))}>Dismiss selected</button>
 </div>
 <div aria-live="polite">{#if message}<p>{message}</p>{/if}{#if busy}<p>Working…</p>{/if}</div>
 {#if failure}<p role="alert" class="failure">{failure}</p>{/if}
 {#each groups as group (group.day)}
  <section>
   <div class="day"><label><input type="checkbox" disabled={busy} checked={checked(group.items)} indeterminate={group.items.some(i => selected.includes(i.id)) && !checked(group.items)} onchange={e => toggle(group.items, e.currentTarget.checked)} /> <strong>{group.day}</strong></label><span>{group.items.length} items</span><button disabled={busy} onclick={() => act('dismiss', group.items)}>Dismiss day</button></div>
   {#each group.items as item (item.id)}
    <article>
     <input type="checkbox" aria-label={`Select ${item.title}`} disabled={busy} checked={selected.includes(item.id)} onchange={e => toggle([item], e.currentTarget.checked)} />
     <div class="preview"><p class="source">{new URL(item.url).hostname} · {item.category}</p><h2><a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a></h2>{#if item.author}<p class="author">{item.author}</p>{/if}{#if item.summary}<p class="summary">{item.summary}</p>{/if}<p class="url">{item.url}</p></div>
     <button disabled={busy} aria-label={`Dismiss ${item.title}`} onclick={() => act('dismiss', [item])}>Dismiss</button>
    </article>
   {/each}
  </section>
 {/each}
 {#if loaded && !items.length}<p>{cursor ? 'No pending bookmarks on this page. Continue loading to review more.' : 'You’re all caught up. No pending bookmarks.'}</p>{/if}
 {#if cursor || !loaded}<button class="more" disabled={busy} onclick={loadMore}>{loaded ? 'Load more from Readwise' : 'Load Readwise'}</button>{/if}
</main>
<style>
 :global(body) { background:#f6f5f1; color:#222; font-size:16px; font-weight:400; }
 main { max-width:960px; margin:auto; padding:32px 24px 80px; } nav { display:flex; justify-content:space-between; } a { color:inherit; } header { margin:64px 0 24px; max-width:680px; } h1 { font-size:56px; line-height:1.1; margin:8px 0 20px; font-weight:500; letter-spacing:-2px; } .eyebrow,.source { font-size:12px; letter-spacing:.08em; } .muted,.source,.author,.url { color:#62635f; } aside { background:#eae9e2; padding:16px; font-size:14px; } .toolbar { position:sticky; top:0; background:#f6f5f1; z-index:1; display:flex; align-items:center; flex-wrap:wrap; gap:16px; padding:20px 0; border-bottom:1px solid #ccc; } label { display:flex; align-items:center; gap:10px; cursor:pointer; } input { width:18px; height:18px; accent-color:#244d3f; flex-shrink:0; } button { border:1px solid #aaa; border-radius:5px; padding:9px 12px; background:transparent; color:inherit; cursor:pointer; font:inherit; font-size:14px; } button:disabled { opacity:.45; cursor:default; } .primary { background:#244d3f; color:white; border-color:#244d3f; } .day { display:flex; align-items:center; gap:18px; margin-top:32px; padding:14px 0; } .day span { flex:1; color:#62635f; font-size:14px; } article { display:flex; align-items:flex-start; gap:18px; border-top:1px solid #ddd; padding:24px 0; } article > input { margin-top:8px; } .preview { flex:1; min-width:0; } h2 { font-size:21px; font-weight:500; line-height:1.35; margin:4px 0; } h2 a { text-decoration:none; } h2 a:hover { text-decoration:underline; } p { margin:8px 0; } .summary { font-size:15px; white-space:pre-line; } .url { overflow-wrap:anywhere; font-size:12px; } .source { margin:0; } .author { font-size:14px; } .failure { padding:16px; background:#f7dfd8; color:#722b17; } .more { margin-top:32px; } @media(max-width:600px) { main { padding:20px 16px 60px; } header { margin-top:40px; } article { gap:10px; flex-wrap:wrap; } article > button { margin-left:30px; } .preview { flex-basis:75%; } }
</style>
