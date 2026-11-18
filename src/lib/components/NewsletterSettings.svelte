<script module lang="ts">
	export interface NewsletterState {
		configured: boolean;
		error?: string;
		newsletter?: { username: string; name: string; url: string; applied: Record<string, boolean>; refused?: Record<string, string> };
	}

	const LABELS: Record<string, string> = {
		archive_theme: 'Archive theme',
		theme_configuration: 'Page colors (gray, white, blue)',
		web_css: 'Page details: no all-caps, square buttons',
		css: 'Email style',
		tint_color: 'Blue for links and buttons',
		subscription_redirect_url: 'Back to the site after signing up',
		subscription_confirmation_redirect_url: 'Back to the site after confirming'
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Notice, Section } from '$lib/components/ui';

	interface Props {
		/** The owner's CSRF token, sent with the change. */
		csrf?: string;
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<NewsletterState>;
		apply?: () => Promise<NewsletterState>;
	}

	let { csrf, load, apply }: Props = $props();

	const ENDPOINT = '/api/buttondown/newsletter';
	let info = $state<NewsletterState | null>(null);
	let busy = $state(false);
	let notice = $state('');

	async function request(method: 'GET' | 'POST'): Promise<NewsletterState> {
		const response = await fetch(ENDPOINT, { method, credentials: 'same-origin', cache: 'no-store', headers: method === 'POST' ? { 'x-csrf-token': csrf ?? '' } : {} });
		const body = (await response.json().catch(() => ({}))) as Partial<NewsletterState>;
		return { configured: body.configured ?? response.status !== 503, ...body };
	}

	onMount(async () => {
		info = await (load ? load() : request('GET'));
	});

	async function onApply() {
		busy = true;
		notice = '';
		const next = await (apply ? apply() : request('POST'));
		busy = false;
		if (next.error) notice = next.error;
		else {
			info = { ...info, ...next, configured: true };
			notice = next.newsletter?.refused ? 'Applied what Buttondown allows. The rest is noted above.' : 'Buttondown now matches the site.';
		}
	}

	const entries = $derived(Object.entries(info?.newsletter?.applied ?? {}));
	const current = $derived(entries.length > 0 && entries.every(([, on]) => on));
</script>

<!-- The owner's newsletter on Buttondown, styled from the site's repo with one button. -->
<Section title="Newsletter">
	{#if !info}
		<p class="hint">Checking Buttondown…</p>
	{:else if !info.configured}
		<Notice>Add the <code>BUTTONDOWN_API_KEY</code> secret to the Worker to turn on email signups.</Notice>
	{:else if info.error && !info.newsletter}
		<Notice tone="error">{info.error}</Notice>
	{:else if info.newsletter}
		<p>Signups from the Subscribe menu go to <a href={info.newsletter.url}>{info.newsletter.name}</a> on Buttondown.</p>
		<ul class="settings">
			{#each entries as [key, on] (key)}
				<li><span class="mark" class:on aria-hidden="true">{on ? '✓' : ''}</span>{LABELS[key] ?? key}<span class="visually-hidden">{on ? ', matches the site' : ', not yet set'}</span>{#if !on && info.newsletter.refused?.[key]}<span class="refused">{info.newsletter.refused[key]}</span>{/if}</li>
			{/each}
		</ul>
		<div class="actions">
			<Button variant={current ? 'secondary' : 'primary'} disabled={busy} onclick={onApply}>{busy ? 'Applying…' : current ? 'Apply again' : 'Apply the site’s style'}</Button>
			<Button variant="quiet" href={info.newsletter.url}>Open signup page</Button>
		</div>
	{/if}
	<p class="status" role="status" aria-live="polite">{notice}</p>
</Section>

<style>
	.settings {
		margin: var(--space-3) 0;
		padding: 0;
		list-style: none;
		font-size: var(--fs-sm);
	}

	.settings li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) 0;
	}

	.refused {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.refused::before {
		content: ' · ';
	}

	.mark {
		display: inline-grid;
		place-items: center;
		width: 1.1em;
		height: 1.1em;
		border: 1px solid var(--border-strong);
		border-radius: 3px;
		font-size: var(--fs-xs);
		line-height: 1;
	}

	.mark.on {
		border-color: var(--text-primary);
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.hint,
	.status {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.status:empty {
		display: none;
	}
</style>
