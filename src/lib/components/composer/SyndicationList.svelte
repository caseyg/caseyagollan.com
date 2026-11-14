<script lang="ts" module>
	export interface SyndicationRow {
		service: string;
		name: string;
		/** Copies of the post on this network. */
		links: string[];
		/** A send started but was never confirmed. */
		pending?: boolean;
		/** The network has no account configured. */
		available?: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		destinations: SyndicationRow[];
		/** Trailing content, such as a "Sync links" button. */
		children?: Snippet;
	}

	let { destinations, children }: Props = $props();

	/** bsky.app/profile/caseyagollan.com/post/3mzoo… reads better without the scheme. */
	function short(link: string): string {
		try { const url = new URL(link); return url.host + url.pathname.replace(/\/$/, ''); } catch { return link; }
	}
</script>

<!-- Where a post already lives on each network, laid out like the editor's properties. -->
<section class="syndication" aria-label="Syndication">
	<dl>
		{#each destinations as destination (destination.service)}
			<div class="row">
				<dt>{destination.name}</dt>
				<dd>
					{#if destination.links.length}
						{#each destination.links as link (link)}<a class="pill" href={link} target="_blank" rel="noopener noreferrer"><span>{short(link)}</span> ↗</a>{/each}
					{:else if destination.pending}
						<span class="status">Sending wasn’t confirmed. Check {destination.name} before retrying.</span>
					{:else if destination.available === false}
						<span class="status muted">Not set up</span>
					{:else}
						<span class="status muted">Not posted</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
	{@render children?.()}
</section>

<style>
	.syndication { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); font-size: var(--fs-sm); }
	dl { align-self: stretch; margin: 0; }
	.row { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr; align-items: baseline; gap: var(--space-2); padding: 2px 0; }
	dt { padding: 0.3rem var(--space-1); color: var(--text-muted); }
	dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1); min-width: 0; margin: 0; }
	.pill { display: inline-flex; gap: 0.3em; max-width: 100%; padding: 1px var(--space-2); border-radius: var(--radius-full); background: var(--surface-2); color: var(--text-primary); line-height: var(--lh-snug); text-decoration: none; transition: background var(--duration) var(--ease); }
	.pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	@media (hover: hover) { .pill:hover { background: var(--surface-3); } }
	.pill:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
	.status { padding: 1px 0; color: var(--text-secondary); line-height: var(--lh-snug); }
	.muted { color: var(--text-muted); }
	@media (max-width: 30rem) { .row { grid-template-columns: 6.5rem 1fr; } }
</style>
