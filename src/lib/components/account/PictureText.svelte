<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Disclosure, Notice, ProgressBar, Row, RowList, Section } from '$lib/components/ui';
	import type { PictureReading } from '$lib/source-status';

	interface Props {
		/** The owner's CSRF token, sent when a reading is asked for. */
		csrf?: string;
		/** Dollars per million tokens the model costs, for the estimate. */
		price?: { input: number; output: number };
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<PictureReading | null>;
		read?: (count: number) => Promise<PictureReading | null>;
	}

	let { csrf, price = { input: 0.3, output: 1 }, load, read }: Props = $props();

	const ENDPOINT = '/api/sources';
	/** A first look at how well the model reads, before the rest. */
	const TRIAL = 20;
	let info = $state<PictureReading | null>(null);
	let checked = $state(false);
	let busy = $state(false);
	let failed = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function request(count?: number): Promise<PictureReading | null> {
		const asking = count !== undefined;
		const response = await fetch(asking ? ENDPOINT : `${ENDPOINT}?pictures`, {
			method: asking ? 'POST' : 'GET',
			credentials: 'same-origin',
			cache: 'no-store',
			...(asking ? { headers: { 'x-csrf-token': csrf ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ read: count }) } : {})
		}).catch(() => null);
		if (!response?.ok) return null;
		return ((await response.json().catch(() => ({}))) as { pictures?: PictureReading }).pictures ?? null;
	}

	/** While pictures are being read, look again every couple of seconds. */
	function watch() {
		clearTimeout(timer);
		if (!info?.asked) return;
		timer = setTimeout(async () => {
			info = (await (load ? load() : request())) ?? info;
			watch();
		}, 2000);
	}

	onMount(() => {
		void (load ? load() : request()).then((loaded) => {
			info = loaded;
			checked = true;
			watch();
		});
		return () => clearTimeout(timer);
	});

	async function ask(count: number) {
		busy = true;
		failed = '';
		const next = await (read ? read(count) : request(count));
		busy = false;
		if (next) info = next;
		else failed = 'That didn’t go through. Try again in a moment.';
		watch();
	}

	const left = $derived(info ? Math.max(info.total - info.read - info.failed, 0) : 0);
	const dollars = (value: number) => (value < 0.01 ? 'under $0.01' : `$${value.toFixed(2)}`);
	const cost = $derived.by(() => {
		const usage = info?.usage;
		if (!usage?.pictures || !(usage.input || usage.output)) return null;
		const each = (usage.input * price.input + usage.output * price.output) / 1_000_000 / usage.pictures;
		return { spent: each * usage.pictures, rest: each * left, tokens: Math.round((usage.input + usage.output) / usage.pictures) };
	});
	const counts = $derived(info ? `${info.read.toLocaleString()} of ${info.total.toLocaleString()} pictures read, ${info.withWords.toLocaleString()} with words in them${info.failed ? `, ${info.failed.toLocaleString()} that couldn’t be read` : ''}.` : '');
</script>

<Section title="Words in pictures">
	<p>A vision model reads the text in your saved pictures, so a poster or a screenshot is found by what it says. The words are kept with the picture and read only once. New saves are read as they arrive; older ones only when asked here.</p>
	{#if failed}<Notice tone="error">{failed}</Notice>{/if}
	{#if !checked}
		<p class="hint">Checking…</p>
	{:else if !info}
		<Notice>The copy needs the site’s Worker, which isn’t running here.</Notice>
	{:else}
		<p class="count" aria-live="polite">{counts}</p>
		{#if info.asked > 0}
			<span class="progress">
				<ProgressBar value={info.total ? (info.read + info.failed) / info.total : undefined} label="Reading pictures" />
				<span class="hint">Reading {Math.min(info.asked, left).toLocaleString()} more…</span>
			</span>
		{/if}
		{#if cost}
			<p class="hint">{`So far ${dollars(cost.spent)}: about ${cost.tokens.toLocaleString()} tokens a picture.${left ? ` The ${left.toLocaleString()} left would cost about ${dollars(cost.rest)}.` : ''}`}</p>
		{/if}
		<div class="foot">
			{#if info.asked > 0}
				<Button size="sm" variant="secondary" disabled={busy} onclick={() => ask(0)}>Stop</Button>
			{:else}
				<Button size="sm" variant="secondary" disabled={busy || !left} onclick={() => ask(TRIAL)}>Read {Math.min(TRIAL, left) || TRIAL}</Button>
				<Button size="sm" variant="secondary" disabled={busy || !left} onclick={() => ask(left)}>Read all {left.toLocaleString()}</Button>
			{/if}
		</div>
		{#if info.recent.length}
			<Disclosure>
				{#snippet summary()}The latest {info?.recent.length} read{/snippet}
				<RowList label="Pictures read lately">
					{#each info.recent as picture (picture.url)}
						<Row title={picture.failed ? 'Couldn’t be read' : picture.text || 'No words'}>
							<a class="picture" href={picture.url} target="_blank" rel="noreferrer"><img src={picture.url} alt="" loading="lazy" decoding="async" /></a>
						</Row>
					{/each}
				</RowList>
			</Disclosure>
		{/if}
	{/if}
</Section>

<style>
	.count {
		margin: var(--space-2) 0;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2) 0;
	}

	.progress {
		display: grid;
		inline-size: 26rem;
		max-inline-size: 100%;
		gap: var(--space-1);
		margin: var(--space-1) 0;
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.picture {
		display: block;
		margin-top: var(--space-1);
	}

	.picture img {
		display: block;
		max-inline-size: 12rem;
		max-block-size: 9rem;
		border-radius: var(--radius-sm);
	}
</style>
