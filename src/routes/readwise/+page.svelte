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
<main>
 <nav><a href="/">Casey Gollan</a><a href="/account">Account</a></nav>
 <header><p class="eyebrow">PRIVATE IMPORT QUEUE</p><h1>Readwise</h1>
 <p class="muted">Choose what belongs on your site. Previews stay private until you import.</p></header>
 <details class="help"><summary>What gets imported?</summary><aside>Imports publish the title, URL, summary below, and selected tags, dated when saved to Reader. Personal notes are never imported. Days use America/New_York time. Day controls apply to loaded items. Dismissals save only Readwise IDs.</aside></details>
 <div class="toolbar">
  <label><input type="checkbox" disabled={busy || !pending.length} checked={checked(pending)} indeterminate={selected.length > 0 && !checked(pending)} onchange={e => toggle(pending, e.currentTarget.checked)} /> Select all loaded</label>
  <button class="primary" disabled={busy || !selected.length} onclick={() => act('import', items.filter(i => selected.includes(i.id)))}>Import selected · {selected.length}</button>
  <button disabled={busy || !selected.length} onclick={() => act('dismiss', items.filter(i => selected.includes(i.id)))}>Dismiss selected</button>
 </div>
 <datalist id="existing-tags">{#each tagOptions as tag}<option value={tag}></option>{/each}</datalist>
 <div aria-live="polite">{#if message}<p>{message}</p>{/if}{#if busy}<p>Working…</p>{/if}</div>
 {#if failure}<p role="alert" class="failure">{failure}</p>{/if}
 {#each groups as group (group.day)}
  <section>
   <div class="day"><label><input type="checkbox" disabled={busy || !group.pending.length} checked={checked(group.pending)} indeterminate={group.pending.some(i => selected.includes(i.id)) && !checked(group.pending)} onchange={e => toggle(group.pending, e.currentTarget.checked)} /> <strong>{group.day}</strong></label><span>{group.pending.length} pending · {group.items.length - group.pending.length} imported</span><button disabled={busy || !group.pending.length} onclick={() => act('dismiss', group.pending)}>Dismiss day</button></div>
   {#each group.items as item (item.id)}
    <article>
     {#if imported[item.id]}
      <div class="preview"><p>Imported</p><h2><a href={imported[item.id]}>{item.title}</a></h2><p><a href={imported[item.id]}>View post →</a></p></div>
     {:else}
     <input type="checkbox" aria-label={`Select ${item.title}`} disabled={busy} checked={selected.includes(item.id)} onchange={e => toggle([item], e.currentTarget.checked)} />
     <div class="preview"><p class="source">{new URL(item.url).hostname} · {item.category}</p><h2><a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a></h2><details class="item-details"><summary>Edit details <span class="detail-hint">· summary &amp; tags{item.tags.length ? ` · ${item.tags.length} ${item.tags.length === 1 ? 'tag' : 'tags'}` : ''}</span></summary>{#if item.author}<p class="author">{item.author}</p>{/if}<label class="editor">Summary<textarea maxlength="4000" disabled={busy} bind:value={item.summary}></textarea></label>
      <div class="tags">{#each item.tags as tag}<button disabled={busy} aria-label={`Remove tag ${tag}`} onclick={() => item.tags = item.tags.filter(t => t !== tag)}>{tag} ×</button>{/each}</div>
      <label class="editor">Add tag<input class="tag-input" list="existing-tags" maxlength="100" disabled={busy} bind:value={tagDraft[item.id]} onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(item); } }} /></label><button disabled={busy || !tagDraft[item.id]?.trim()} onclick={() => addTag(item)}>Add tag</button><p class="url"><a href={item.url} target="_blank" rel="noreferrer noopener">{item.url}</a></p></details></div>
     <button disabled={busy} aria-label={`Dismiss ${item.title}`} onclick={() => act('dismiss', [item])}>Dismiss</button>
     {/if}
    </article>
   {/each}
  </section>
 {/each}
 {#if loaded && !items.length}<p>{cursor ? 'No pending bookmarks on this page. Continue loading to review more.' : 'You’re all caught up. No pending bookmarks.'}</p>{/if}
 {#if cursor || !loaded}<button class="more" disabled={busy} onclick={loadMore}>{loaded ? 'Load more from Readwise' : 'Load Readwise'}</button>{/if}
</main>
<style>
 :global(body) { background:var(--bg-primary); color:var(--text-primary); font-size:14px; font-weight:400; }
 main { font-size:14px; font-weight:400; line-height:1.5; max-width:54rem; margin:auto; padding:24px 24px 64px; }
 nav { display:flex; justify-content:space-between; font-size:14px; }
 a { color:inherit; text-underline-offset:.18em; }
 header { margin:28px 0 10px; }
 h1 { font-size:32px; line-height:1.1; margin:4px 0 8px; font-weight:400; letter-spacing:-1px; }
 .eyebrow,.source { font-size:11px; letter-spacing:.04em; }
 .eyebrow { margin:0; }
 .muted,.source,.author,.url,.detail-hint { color:var(--text-secondary); }
 p { margin:4px 0; }
 .help { font-size:12px; margin-bottom:12px; }
 summary { cursor:pointer; width:fit-content; }
 summary:hover { color:white; }
 aside { max-width:42rem; margin:8px 0; line-height:1.5; }
 .toolbar { position:sticky; top:0; background:var(--bg-primary); z-index:1; display:flex; align-items:center; flex-wrap:wrap; gap:8px 14px; padding:10px 0; border-bottom:1px solid var(--border); }
 label { display:flex; align-items:center; gap:8px; cursor:pointer; }
 input[type="checkbox"] { width:16px; height:16px; margin:0; accent-color:blue; flex-shrink:0; }
 button { border:1px solid rgba(255,255,255,.5); border-radius:0; padding:4px 8px; background:transparent; color:inherit; cursor:pointer; font:inherit; font-size:12px; }
 button:hover:not(:disabled) { background:var(--accent); border-color:var(--accent); }
 button:disabled { opacity:.45; cursor:default; }
 .primary { background:var(--accent); border-color:var(--accent); }
 :is(a,button,input,textarea,summary):focus-visible { outline:2px solid white; outline-offset:3px; }
 .day { display:flex; align-items:center; flex-wrap:wrap; gap:8px 14px; margin-top:16px; padding:8px 0; font-size:12px; }
 .day span { flex:1; color:var(--text-secondary); }
 article { display:flex; align-items:flex-start; gap:12px; border-top:1px solid var(--border); padding:10px 0; }
 article > input { margin-top:5px !important; }
 article > button { margin-top:2px; }
 .preview { flex:1; min-width:0; }
 h2 { font-size:16px; font-weight:400; line-height:1.35; margin:2px 0; }
 h2 a { text-decoration:none; }
 h2 a:hover { text-decoration:underline; }
 .source { margin:0; }
 .author { font-size:12px; }
 .item-details { margin-top:4px; font-size:12px; }
 .item-details[open] { margin-top:8px; }
 .url { overflow-wrap:anywhere; font-size:11px; margin-top:10px; }
 .failure { padding:10px; border:1px solid white; }
 .editor { display:flex; flex-direction:column; align-items:stretch; gap:4px; margin:10px 0; font-size:12px; }
 textarea { min-height:64px; resize:vertical; font:inherit; padding:6px; border:1px solid rgba(255,255,255,.5); border-radius:0; background:transparent; color:inherit; }
 input.tag-input { width:100%; box-sizing:border-box; font:inherit; padding:5px 6px; border:1px solid rgba(255,255,255,.5); border-radius:0; background:transparent; color:inherit; }
 .tags { display:flex; flex-wrap:wrap; gap:4px; }
 .more { margin-top:16px; }
 @media(max-width:600px) {
  main { padding:16px 14px 48px; }
  header { margin-top:20px; }
  .toolbar { gap:8px; font-size:12px; }
  .toolbar label { flex-basis:100%; }
  article { gap:8px; }
  .detail-hint { display:none; }
  .day { gap:6px 10px; }
  .day span { font-size:11px; }
 }
</style>
