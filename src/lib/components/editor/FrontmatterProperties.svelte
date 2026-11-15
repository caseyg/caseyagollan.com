<script lang="ts" module>
	export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
	export interface ReadOnlyRow { key: string; values: Json[] }
</script>

<script lang="ts">
	import { formatAbsoluteDate } from '$lib/utils/formatDate';
	import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';

	interface Props {
		/** Editable text properties, as { key: [values] }. Bound, and posted as JSON under `name`. */
		properties: Record<string, string[]>;
		/** Rows shown but not editable: dates, photos and protocol bookkeeping. */
		readOnly?: ReadOnlyRow[];
		published?: string;
		updated?: string;
		status: 'published' | 'draft';
		/** Hidden field that carries the properties to the server. */
		name?: string;
	}

	let { properties = $bindable(), readOnly = [], published, updated, status = $bindable('published'), name = 'properties' }: Props = $props();

	/** Properties that are lists even with one value. */
	const LISTS = new Set(['category', 'syndication', 'pesos-source', 'pesos-date-source', 'quotation-of', 'photo', 'video', 'audio']);
	const LABELS: Record<string, string> = { category: 'tags' };
	const SUGGESTIONS = ['summary', 'category', 'syndication', 'in-reply-to', 'bookmark-of', 'like-of', 'repost-of', 'quotation-of', 'location', 'rsvp'];

	type Kind = 'tags' | 'list' | 'url' | 'text' | 'date' | 'object' | 'locked';
	const isUrl = (value: string) => /^https?:\/\/\S+$/.test(value);
	function kind(key: string, values: string[]): Kind {
		if (key === 'category') return 'tags';
		if (LISTS.has(key) || values.length > 1) return 'list';
		return isUrl(values[0] ?? '') || ['in-reply-to', 'bookmark-of', 'like-of', 'repost-of'].includes(key) ? 'url' : 'text';
	}
	const icons: Record<Kind | 'status', IconName> = { date: 'calendar', status: 'status', tags: 'hash', list: 'properties', url: 'link', text: 'text', object: 'box', locked: 'lock' };

	let open = $state(true);
	let adding = $state(false);
	let newKey = $state('');
	let newValue = $state('');
	let keyError = $state('');
	const drafts: Record<string, string> = $state({});

	const json = $derived(JSON.stringify(properties));
	const display = (value: string) => value.replace(/^https?:\/\/(www\.)?/, '');

	function setSingle(key: string, value: string) { properties[key] = [value]; }
	function addValue(key: string) {
		const value = (drafts[key] ?? '').trim().replace(key === 'category' ? /^#/ : /^$/, '');
		const values = key === 'category' ? value.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean) : value ? [value] : [];
		if (values.length) properties[key] = [...new Set([...(properties[key] ?? []), ...values])];
		drafts[key] = '';
	}
	function removeValue(key: string, index: number) { properties[key] = properties[key].filter((_, i) => i !== index); }
	function removeProperty(key: string) { const { [key]: _, ...rest } = properties; properties = rest; }
	function listKeydown(event: KeyboardEvent, key: string) {
		if (event.key === 'Enter' || (event.key === ',' && key === 'category')) { event.preventDefault(); addValue(key); }
		else if (event.key === 'Backspace' && !drafts[key] && properties[key]?.length) removeValue(key, properties[key].length - 1);
	}
	function addProperty() {
		const key = newKey.trim().toLowerCase();
		if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key)) { keyError = 'Use lowercase letters, numbers and hyphens.'; return; }
		if (key in properties || readOnly.some(row => row.key === key) || ['content', 'name', 'published', 'updated', 'post-status'].includes(key)) { keyError = `This post already has ${key}.`; return; }
		properties[key] = newValue.trim() ? (key === 'category' ? newValue.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean) : [newValue.trim()]) : [];
		newKey = ''; newValue = ''; keyError = ''; adding = false;
	}
	function describe(row: ReadOnlyRow): string {
		if (row.values.every(value => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) return row.values.join(', ');
		const n = row.values.length;
		return `${n} ${n === 1 ? 'item' : 'items'}`;
	}
	function urlOf(value: Json): string | undefined {
		if (typeof value === 'string' && isUrl(value)) return value;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const url = value.url ?? value.value;
			if (typeof url === 'string' && isUrl(url)) return url;
		}
	}
</script>

{#snippet icon(name: keyof typeof icons)}<Icon name={icons[name]} size={16} />{/snippet}

<section class="properties" aria-label="Properties">
	<input type="hidden" {name} value={json} />
	<input type="hidden" name="status" value={status} />
	<button type="button" class="heading" aria-expanded={open} onclick={() => { open = !open; }}>
		<span class="caret" class:open aria-hidden="true">›</span> Properties
	</button>
	{#if open}
		<dl>
			{#if published}
				<div class="row">
					<dt>{@render icon('date')}date</dt>
					<dd class="static" title={published}>{formatAbsoluteDate(published)}</dd>
				</div>
			{/if}
			{#if updated}
				<div class="row">
					<dt>{@render icon('date')}updated</dt>
					<dd class="static" title={updated}>{formatAbsoluteDate(updated)}</dd>
				</div>
			{/if}
			<div class="row">
				<dt><label for="property-status">{@render icon('status')}status</label></dt>
				<dd>
					<select id="property-status" class="inline" bind:value={status}>
						<option value="published">Published</option>
						<option value="draft">Draft</option>
					</select>
				</dd>
			</div>
			{#each Object.keys(properties) as key (key)}
				{@const values = properties[key]}
				{@const type = kind(key, values)}
				<div class="row">
					<dt><label for="property-{key}">{@render icon(type)}{LABELS[key] ?? key}</label></dt>
					<dd>
						{#if type === 'tags' || type === 'list'}
							<div class="pills">
								{#each values as value, index (index)}
									<span class="pill" class:tag={type === 'tags'} title={value}>
										{#if isUrl(value)}<a href={value} target="_blank" rel="noopener noreferrer">{display(value)}</a>{:else}<span>{type === 'tags' ? `#${value}` : value}</span>{/if}
										<button type="button" aria-label="Remove {value}" onclick={() => removeValue(key, index)}>×</button>
									</span>
								{/each}
								<input id="property-{key}" class="inline add" bind:value={drafts[key]} placeholder={values.length ? '' : type === 'tags' ? 'Add tags' : 'Add a value'} autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown={event => listKeydown(event, key)} onblur={() => addValue(key)} />
							</div>
						{:else}
							<div class="single">
								<input id="property-{key}" class="inline" class:mono={type === 'url'} type={type === 'url' ? 'url' : 'text'} value={values[0] ?? ''} oninput={event => setSingle(key, event.currentTarget.value)} autocomplete="off" spellcheck={type !== 'url'} />
								{#if type === 'url' && isUrl(values[0] ?? '')}<a class="open" href={values[0]} target="_blank" rel="noopener noreferrer" aria-label="Open {key}">↗</a>{/if}
							</div>
						{/if}
					</dd>
					<button type="button" class="remove" aria-label="Remove the {key} property" title="Remove property" onclick={() => removeProperty(key)}>×</button>
				</div>
			{/each}
			{#each readOnly as row (row.key)}
				{@const urls = row.values.map(urlOf).filter((url): url is string => !!url)}
				<div class="row locked" title="Edit this property in the source file">
					<dt>{@render icon(row.values.every(value => typeof value !== 'object' || value === null) ? 'locked' : 'object')}{row.key}</dt>
					<dd class="static">
						{#if urls.length && urls.length === row.values.length}
							<span class="pills">{#each urls as url, index (index)}<span class="pill"><a href={url} target="_blank" rel="noopener noreferrer">{display(url)}</a></span>{/each}</span>
						{:else}{describe(row)}{/if}
					</dd>
				</div>
			{/each}
		</dl>
		{#if adding}
			<div class="new">
				<input class="inline key" list="property-suggestions" bind:value={newKey} placeholder="property" aria-label="Property name" autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); addProperty(); } else if (event.key === 'Escape') adding = false; }} />
				<input class="inline" bind:value={newValue} placeholder="value" aria-label="Value" autocomplete="off" onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); addProperty(); } else if (event.key === 'Escape') adding = false; }} />
				<button type="button" class="text-button" onclick={addProperty}>Add</button>
				<datalist id="property-suggestions">{#each SUGGESTIONS.filter(key => !(key in properties)) as key (key)}<option value={key}></option>{/each}</datalist>
			</div>
			{#if keyError}<p class="error" role="alert">{keyError}</p>{/if}
		{:else}
			<button type="button" class="text-button add-property" onclick={() => { adding = true; }}>+ Add property</button>
		{/if}
	{/if}
</section>

<style>
	.properties { margin: 0 0 var(--space-5); font-size: var(--fs-sm); }
	.heading { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) 0; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: var(--fs-xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; cursor: pointer; }
	.heading:hover { color: var(--text-primary); }
	.caret { display: inline-block; transition: transform var(--duration) var(--ease); }
	.caret.open { transform: rotate(90deg); }
	dl { margin: var(--space-1) 0 0; }
	.row { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr 1.75rem; align-items: start; gap: var(--space-2); padding: 2px 0; border-radius: var(--radius-sm); }
	.row:hover { background: var(--surface-1); }
	dt, dt label { display: flex; align-items: center; gap: var(--space-2); min-width: 0; padding: 0.3rem var(--space-1); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
	dt label { padding: 0; }
	dd { min-width: 0; margin: 0; }
	.static { padding: 0.3rem var(--space-1); color: var(--text-secondary); overflow-wrap: anywhere; }
	.locked .static { color: var(--text-muted); }
	.single { display: flex; align-items: center; gap: var(--space-1); }
	.inline { box-sizing: border-box; width: 100%; min-width: 0; padding: 0.3rem var(--space-1); border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text-primary); font: inherit; line-height: var(--lh-snug); }
	.inline:hover { border-color: var(--border); }
	.inline:focus { border-color: var(--border-strong); background: var(--surface-sunken); outline: none; }
	.inline.mono { font-family: var(--font-mono); font-size: var(--fs-xs); }
	select.inline { width: auto; cursor: pointer; }
	select.inline option { color: initial; }
	.pills { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); padding: 2px 0; }
	.pill { display: inline-flex; align-items: center; gap: 2px; max-width: calc(100% - 2.75rem); padding: 1px 2px 1px var(--space-2); border-radius: var(--radius-full); background: var(--surface-2); line-height: var(--lh-snug); }
	.pill > a, .pill > span { overflow: hidden; color: inherit; text-overflow: ellipsis; white-space: nowrap; }
	.pill > a { text-decoration: none; }
	.pill > a:hover { text-decoration: underline; text-underline-offset: var(--underline-offset); }
	.locked .pill { padding-right: var(--space-2); background: var(--surface-1); }
	.pill button, .remove { flex: none; width: 1.25rem; height: 1.25rem; padding: 0; border: 0; border-radius: var(--radius-full); background: none; color: var(--text-muted); font: inherit; line-height: 1; cursor: pointer; }
	.pill button:hover, .remove:hover { background: var(--surface-3); color: var(--text-primary); }
	.remove { margin-top: 0.3rem; opacity: 0; }
	.row:hover .remove, .remove:focus-visible { opacity: 1; }
	.add { flex: 1 1 2rem; width: auto; min-width: 2rem; }
	.add:placeholder-shown:not(:focus) { padding-inline: 0; }
	.open { padding: 0 var(--space-1); color: var(--text-muted); text-decoration: none; }
	.open:hover { color: var(--text-primary); }
	.new { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr auto; gap: var(--space-2); margin-top: var(--space-1); }
	.new .key { font-family: var(--font-mono); font-size: var(--fs-xs); }
	.text-button { padding: 0.3rem var(--space-1); border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-muted); font: inherit; cursor: pointer; }
	.text-button:hover { background: var(--surface-1); color: var(--text-primary); }
	.add-property { margin-top: var(--space-1); }
	.error { margin: var(--space-1) 0 0; color: var(--text-primary); font-size: var(--fs-xs); }
	@media (hover: none) { .remove { opacity: 1; } }
	@media (max-width: 30rem) {
		.row { grid-template-columns: 7.5rem 1fr 1.75rem; }
		.new { grid-template-columns: 1fr; }
	}
</style>
