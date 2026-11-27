<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Notice, Row, RowList, Section } from '$lib/components/ui';
	import type { SourcesState, SourceStatus } from '$lib/source-status';

	interface Props {
		/** The owner's CSRF token, sent when a sync is asked for. */
		csrf?: string;
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<SourcesState>;
		sync?: () => Promise<SourcesState>;
	}

	let { csrf, load, sync }: Props = $props();

	const ENDPOINT = '/api/sources';
	let info = $state<SourcesState | null>(null);
	let busy = $state(false);
	let failed = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function request(start = false): Promise<SourcesState> {
		const response = await fetch(ENDPOINT, { method: start ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: start ? { 'x-csrf-token': csrf ?? '' } : {} }).catch(() => null);
		const body = (await response?.json().catch(() => ({})) ?? {}) as Partial<SourcesState>;
		return { available: body.available ?? false, sources: body.sources ?? [], ...(response?.ok ? {} : { error: body.error ?? 'That didn’t go through. Try again in a moment.' }) };
	}

	/** While a pass is under way, look again every few seconds so the counts climb. */
	function watch() {
		clearTimeout(timer);
		if (!info?.sources.some((source) => source.syncing)) return;
		timer = setTimeout(async () => { const next = await (load ? load() : request()); if (!next.error) info = next; watch(); }, 6000);
	}

	onMount(() => {
		void (load ? load() : request()).then((loaded) => { info = loaded; watch(); });
		return () => clearTimeout(timer);
	});

	async function start() {
		busy = true;
		failed = '';
		const next = await (sync ? sync() : request(true));
		busy = false;
		if (next.error) failed = next.error;
		else info = next;
		watch();
	}

	const count = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString()} ${value === 1 ? one : many}`;
	const when = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	function detail(source: SourceStatus): string {
		if (!source.configured) return `Not connected: ${source.name}’s access token isn’t saved with the site.`;
		if (!source.documents && !source.syncing) return 'Nothing copied yet.';
		const parts = [count(source.documents, 'item'), source.highlights ? count(source.highlights, 'highlight') : '', source.withText ? `${source.withText.toLocaleString()} with their text` : ''].filter(Boolean);
		const state = source.syncing ? (source.everything ? 'Catching up now.' : 'First copy under way.') : source.synced ? `Up to date as of ${when(source.synced)}.` : '';
		return `${parts.join(', ')}. ${state}`.trim();
	}
</script>

<Section title="Saved copies">
	<p>The site keeps its own private copy of what you save elsewhere, whole texts and highlights included, so the chat can search all of it at once without asking each service. Only you can read it; a table or post that uses an item gets a copy of its title, excerpt, link and picture, and nothing else.</p>
	{#if failed}<Notice tone="error">{failed}</Notice>{/if}
	{#if !info}
		<p class="hint">Checking…</p>
	{:else if info.error}
		<Notice tone="error">{info.error}</Notice>
	{:else if !info.available}
		<Notice>The copy needs the site’s Worker, which isn’t running here.</Notice>
	{:else}
		<RowList label="Sources">
			{#each info.sources as source (source.source)}
				<Row title={`${source.icon} ${source.name}`} detail={detail(source)} aria-busy={source.syncing} />
			{/each}
		</RowList>
		<div class="foot">
			<Button size="sm" variant="secondary" disabled={busy || info.sources.some((source) => source.syncing)} onclick={start}>{busy ? 'Starting…' : info.sources.some((source) => source.syncing) ? 'Syncing…' : 'Sync now'}</Button>
			<span class="hint">The live site syncs by itself every few minutes. A preview syncs only when asked.</span>
		</div>
	{/if}
</Section>

<style>
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.hint {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
