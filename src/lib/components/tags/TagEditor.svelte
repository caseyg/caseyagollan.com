<script module lang="ts">
	import type { TagEdit } from '$lib/tag-edits';

	/** One thing whose tags are being edited: what it is called, the tags it has, and its staged edit. */
	export interface TagTarget {
		ref: string;
		title: string;
		/** Undefined until they are read. */
		tags?: string[];
		edit?: TagEdit;
		error?: string;
	}
</script>

<script lang="ts">
	import { cleanTags, refSource, tallyTags, type TagSource, type TagTally } from '$lib/tag-edits';
	import Button from '../ui/Button.svelte';
	import Chip from '../ui/Chip.svelte';
	import Notice from '../ui/Notice.svelte';
	import TextField from '../ui/TextField.svelte';

	interface Props {
		/** What the edits apply to: the selected blocks, or every block with tags when none is selected. */
		targets: TagTarget[];
		/** Whether `targets` is a selection, or the whole table. */
		scope?: 'selection' | 'table';
		/** Tags already in use, offered as the field is typed in. */
		suggestions?: string[];
		/** Staged edits waiting to be saved, here and on other tables. */
		staged?: number;
		/** Tags are still being read for some targets. */
		reading?: boolean;
		problem?: string;
		onadd: (tags: string[]) => void;
		onremove: (tag: string) => void;
		onreview?: () => void;
		onclose?: () => void;
	}

	let { targets, scope = 'selection', suggestions = [], staged = 0, reading = false, problem = '', onadd, onremove, onreview, onclose }: Props = $props();

	let typed = $state('');
	const tally = $derived(tallyTags(targets));
	const failed = $derived(targets.filter((target) => target.error));

	const NOUN: Record<TagSource, [string, string]> = { post: ['post', 'posts'], raindrop: ['bookmark', 'bookmarks'], readwise: ['Readwise item', 'Readwise items'] };
	const counts = $derived(
		(Object.keys(NOUN) as TagSource[])
			.map((source) => ({ source, count: targets.filter((target) => refSource(target.ref) === source).length }))
			.filter((entry) => entry.count)
			.map((entry) => `${entry.count} ${NOUN[entry.source][entry.count === 1 ? 0 : 1]}`)
	);
	const summary = $derived(counts.length > 1 ? `${counts.slice(0, -1).join(', ')} and ${counts.at(-1)}` : (counts[0] ?? ''));
	const heading = $derived(targets.length === 1 ? targets[0].title : scope === 'table' ? `Everything with tags on this table: ${summary}` : `${summary} selected`);
	const offered = $derived(suggestions.filter((name) => !tally.some((row) => row.name.toLowerCase() === name.toLowerCase() && row.count === row.total)).slice(0, 200));

	function add(event: SubmitEvent) {
		event.preventDefault();
		const tags = cleanTags([typed]);
		if (!tags.length) return;
		onadd(tags);
		typed = '';
	}

	const count = (row: TagTally) => (row.total === 1 ? '' : row.count === row.total ? 'all' : `${row.count} of ${row.total}`);
	const note = (row: TagTally) => (row.state === 'added' ? 'to add' : row.state === 'removed' ? 'to remove' : row.state === 'mixed' ? 'changing' : '');
</script>

<section class="tag-editor" aria-label="Tags">
	<header class="head">
		<h2 class="heading">Tags</h2>
		{#if onclose}<Button variant="icon" size="sm" icon="close" label="Close" onclick={onclose} />{/if}
	</header>

	{#if !targets.length}
		<p class="hint">Nothing here has tags to edit. Posts from this site, Raindrop bookmarks and Readwise items do: add some, or select them.</p>
	{:else}
		<p class="about" title={heading}>{heading}</p>
		{#if scope === 'table' && targets.length > 1}<p class="hint">Select blocks to tag only those.</p>{/if}

		<form class="add" onsubmit={add}>
			<TextField label={targets.length === 1 ? 'Add a tag' : `Add a tag to all ${targets.length}`} bind:value={typed} placeholder="tag, another tag" autocomplete="off" list="tag-editor-suggestions" enterkeyhint="done" />
			<Button type="submit" variant="secondary" size="sm" disabled={!typed.trim()}>Add</Button>
			<datalist id="tag-editor-suggestions">{#each offered as name (name)}<option value={name}></option>{/each}</datalist>
		</form>

		<ul class="tally" aria-label="Tags on these" aria-busy={reading}>
			{#each tally as row (row.name.toLowerCase())}
				<li class="row row--{row.state}">
					<Chip variant="soft" class="tag">{row.name}</Chip>
					<span class="count">{[count(row), note(row)].filter(Boolean).join(' · ')}</span>
					{#if row.count < row.total}<Button variant="icon" size="sm" icon="plus" label={row.total === 1 ? `Keep “${row.name}”` : `Add “${row.name}” to all ${row.total}`} onclick={() => onadd([row.name])} />{/if}
					{#if row.count > 0}<Button variant="icon" size="sm" icon="close" label={row.total === 1 ? `Remove “${row.name}”` : `Remove “${row.name}” from all`} onclick={() => onremove(row.name)} />{/if}
				</li>
			{:else}
				<li class="empty">{reading ? 'Reading tags…' : 'No tags yet.'}</li>
			{/each}
		</ul>

		{#if failed.length}
			<Notice>{failed.length === 1 ? `“${failed[0].title}”: ${failed[0].error}` : `${failed.length} of these couldn’t be read. ${failed[0].error}`}</Notice>
		{/if}
	{/if}
	{#if problem}<Notice tone="error">{problem}</Notice>{/if}

	<footer class="foot">
		<span class="staged" role="status">{staged ? `${staged} ${staged === 1 ? 'thing has' : 'things have'} changes not saved yet` : 'Changes wait here until you save them.'}</span>
		{#if onreview}<Button variant="primary" size="sm" disabled={!staged} onclick={onreview}>Review and save</Button>{/if}
	</footer>
</section>

<style>
	.tag-editor {
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
		justify-content: space-between;
	}

	.heading {
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
	}

	.about {
		margin: var(--space-1) 0 0;
		overflow: hidden;
		color: var(--text-secondary);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint {
		margin: var(--space-1) 0 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.add {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		margin: var(--space-3) 0 var(--space-2);
	}

	.add :global(.text-field) {
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	.tally {
		flex: 1;
		min-height: 4rem;
		margin: 0 calc(-1 * var(--space-2));
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2rem;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
	}

	.row :global(.tag) {
		box-sizing: border-box;
		min-width: 0;
		max-width: 60%;
		overflow: hidden;
		border: 1px solid transparent;
		text-overflow: ellipsis;
	}

	.row--added :global(.tag) {
		border: 1px dashed var(--border-strong);
		background: transparent;
	}

	.row--removed :global(.tag) {
		background: transparent;
		color: var(--text-muted);
		text-decoration: line-through;
	}

	.count {
		flex: 1;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}

	.empty {
		padding: var(--space-3) var(--space-2);
		color: var(--text-muted);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}

	.staged {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
</style>
