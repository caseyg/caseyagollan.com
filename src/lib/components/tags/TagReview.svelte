<script module lang="ts">
	import type { TagGroupResult, TagSource, TagView } from '$lib/tag-edits';

	/** One staged edit in the review: what it is on, and its tags with the changes marked. */
	export interface ReviewItem { ref: string; title: string; url?: string; tags: TagView[]; error?: string }
	/** The edits bound for one place, and what came of saving them. */
	export interface ReviewGroup { source: TagSource; items: ReviewItem[] }
</script>

<script lang="ts">
	import { TAG_DESTINATION, TAG_SOURCE_NAME } from '$lib/tag-edits';
	import Button from '../ui/Button.svelte';
	import Notice from '../ui/Notice.svelte';
	import TextField from '../ui/TextField.svelte';
	import TagChips from './TagChips.svelte';

	interface Props {
		/** Staged edits, by where they are written. */
		groups: ReviewGroup[];
		/** Sources that can't be written from here (a preview, the demo): saving them only rehearses. */
		rehearsed?: TagSource[];
		/** The posts' commit message; empty uses `summary`. */
		message?: string;
		/** The commit message used when none is typed, such as `Tag 3 posts: +indieweb`. */
		summary?: string;
		saving?: boolean;
		/** What the last save did, by source. */
		results?: TagGroupResult[];
		problem?: string;
		onsave: () => void;
		/** Drops one thing's staged edit. */
		ondiscard: (ref: string) => void;
		ondiscardall?: () => void;
		onback?: () => void;
		onclose?: () => void;
	}

	let { groups, rehearsed = [], message = $bindable(''), summary = '', saving = false, results = [], problem = '', onsave, ondiscard, ondiscardall, onback, onclose }: Props = $props();

	const total = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));
	const rehearsal = $derived(groups.length > 0 && groups.every((group) => rehearsed.includes(group.source)));
	const rehearsedNames = $derived(groups.filter((group) => rehearsed.includes(group.source)).map((group) => TAG_SOURCE_NAME[group.source]));

	function outcome(result: TagGroupResult): string {
		const saved = result.items.filter((item) => item.ok).length;
		const name = TAG_SOURCE_NAME[result.source];
		if (result.error) return `${name}: ${result.error}`;
		if (result.dryRun) return `${name}: rehearsed ${saved}. Nothing was written${result.message ? `; the commit would read “${result.message}”` : ''}.`;
		const failed = result.items.length - saved;
		return `${name}: saved ${saved}${failed ? `, ${failed} not saved (still below)` : ''}${result.source === 'post' && !result.commit && !failed ? ' (they already had these tags)' : ''}.`;
	}
</script>

<section class="tag-review" aria-label="Review tag changes">
	<header class="head">
		{#if onback}<Button variant="icon" size="sm" icon="undo" label="Back to tags" onclick={onback} />{/if}
		<h2 class="heading">Review changes</h2>
		{#if onclose}<Button variant="icon" size="sm" icon="close" label="Close" onclick={onclose} />{/if}
	</header>

	{#if results.length}
		<div class="results" role="status">
			{#each results as result (result.source)}
				<p class="result">
					{outcome(result)}
					{#if result.commit}<a href={result.commit.url} target="_blank" rel="noopener">Commit {result.commit.sha.slice(0, 7)}</a>{/if}
				</p>
			{/each}
		</div>
	{/if}

	{#if rehearsedNames.length && total}
		<Notice>Nothing is written from here{rehearsal ? '' : ` for ${rehearsedNames.join(' and ')}`}: saving rehearses the changes and says what would happen. They are saved for real on caseyagollan.com.</Notice>
	{/if}
	{#if problem}<Notice tone="error">{problem}</Notice>{/if}

	<div class="groups">
		{#each groups as group (group.source)}
			<section class="group" aria-label={TAG_SOURCE_NAME[group.source]}>
				<h3 class="group-title">{TAG_SOURCE_NAME[group.source]} <span class="count">{group.items.length}</span></h3>
				<p class="hint">{TAG_DESTINATION[group.source]}{rehearsed.includes(group.source) ? ' (rehearsed here)' : ''}.</p>
				{#if group.source === 'post'}
					<TextField label="Commit message" bind:value={message} placeholder={summary} autocomplete="off" />
				{/if}
				<ul class="items">
					{#each group.items as item (item.ref)}
						<li class="item">
							<div class="item-head">
								{#if item.url}<a class="title" href={item.url} target="_blank" rel="noopener">{item.title}</a>{:else}<span class="title">{item.title}</span>{/if}
								<Button variant="icon" size="sm" icon="close" label="Discard the changes to “{item.title}”" onclick={() => ondiscard(item.ref)} />
							</div>
							<TagChips tags={item.tags} label="Tags of {item.title}" />
							{#if item.error}<p class="error" role="alert">{item.error}</p>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{:else}
			<p class="empty">{results.length ? 'Nothing is left to save.' : 'No changes are waiting. Add or remove tags and they will be listed here before anything is saved.'}</p>
		{/each}
	</div>

	<footer class="foot">
		{#if ondiscardall}<Button variant="quiet" size="sm" disabled={!total || saving} onclick={ondiscardall}>Discard all</Button>{/if}
		<Button variant="primary" size="sm" disabled={!total || saving} onclick={onsave}>{saving ? 'Saving…' : rehearsal ? `Rehearse ${total} ${total === 1 ? 'change' : 'changes'}` : `Save ${total} ${total === 1 ? 'change' : 'changes'}`}</Button>
	</footer>
</section>

<style>
	.tag-review {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		min-height: 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		font-size: var(--fs-sm);
		font-weight: var(--fw-regular);
		line-height: var(--lh-normal);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.heading {
		flex: 1;
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
	}

	.results {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-left: 2px solid var(--border-strong);
		background: var(--surface-sunken);
	}

	.result {
		margin: 0;
	}

	.result + .result {
		margin-top: var(--space-1);
	}

	.result a,
	.title {
		color: inherit;
	}

	.tag-review :global(.notice) {
		margin: var(--space-2) 0 0;
	}

	.groups {
		flex: 1;
		min-height: 4rem;
		margin: var(--space-2) calc(-1 * var(--space-2)) 0;
		padding: 0 var(--space-2);
		overflow-y: auto;
	}

	.group + .group {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}

	.group-title {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.count {
		color: var(--text-muted);
		font-weight: var(--fw-regular);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.group :global(.text-field) {
		margin: var(--space-2) 0;
	}

	.items {
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
	}

	.item {
		padding: var(--space-1) 0 var(--space-2);
	}

	.item + .item {
		border-top: 1px solid var(--border-subtle);
	}

	.item-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error {
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
	}

	.empty {
		margin: var(--space-3) 0;
		color: var(--text-muted);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}
</style>
