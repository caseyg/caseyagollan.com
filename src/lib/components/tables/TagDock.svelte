<script lang="ts">
	import { groupStaged, refSource, tagSummary, type TagGroupResult } from '$lib/tag-edits';
	import { discard, loadTags, saveTags, stage, stagedCount, tagsOn, tagStore } from '$lib/tag-edits.svelte';
	import TagEditor, { type TagTarget } from '../tags/TagEditor.svelte';
	import TagReview, { type ReviewGroup } from '../tags/TagReview.svelte';
	import type { TaggableBlock } from './canvas/TableEditor';

	interface Props {
		/** Every block on the table that has tags somewhere, with whether it is selected. */
		taggable: TaggableBlock[];
		/** `edit` changes the tags of the selection (or of everything, with nothing selected); `review` lists what is staged and saves it. */
		mode?: 'edit' | 'review';
		onclose?: () => void;
	}

	let { taggable, mode = $bindable('edit'), onclose }: Props = $props();

	// A post set down twice is one thing to tag.
	const unique = (blocks: TaggableBlock[]) => blocks.filter((block, index) => blocks.findIndex((other) => other.ref === block.ref) === index);
	const selected = $derived(unique(taggable.filter((block) => block.selected)));
	const scoped = $derived(selected.length ? selected : unique(taggable));
	const targets = $derived(
		scoped.map((block): TagTarget => {
			const known = tagStore.known[block.ref];
			return { ref: block.ref, title: block.title, tags: known && !known.error ? known.tags : undefined, edit: tagStore.staged[block.ref], error: known?.error };
		})
	);
	const reading = $derived(scoped.some((block) => tagStore.reading[block.ref] && !tagStore.known[block.ref]));
	const titles = $derived(Object.fromEntries(scoped.map((block) => [block.ref, block.title])));
	const refs = $derived(scoped.map((block) => block.ref));

	let message = $state('');
	let saving = $state(false);
	let problem = $state('');
	let results = $state<TagGroupResult[]>([]);

	/** Where a staged thing can be opened, and what to call one staged on another table. */
	const address = (ref: string) => (ref.startsWith('post:') ? ref.slice(5) : ref.startsWith('raindrop:link:') ? ref.slice(14) : undefined);
	const named = (ref: string) => tagStore.titles[ref] ?? taggable.find((block) => block.ref === ref)?.title ?? address(ref) ?? (refSource(ref) === 'raindrop' ? 'A Raindrop bookmark' : 'Something in Readwise');
	const failures = $derived(new Map(results.flatMap((result) => result.items.filter((item) => !item.ok && item.error).map((item) => [item.ref, item.error!]))));
	const groups = $derived(
		groupStaged(tagStore.staged).map((group): ReviewGroup => ({ source: group.source, items: group.refs.map((ref) => ({ ref, title: named(ref), url: address(ref), tags: tagsOn(ref), error: failures.get(ref) })) }))
	);
	const summary = $derived(tagSummary(Object.entries(tagStore.staged).filter(([ref]) => refSource(ref) === 'post').map(([, edit]) => edit)));

	async function save() {
		saving = true;
		problem = '';
		try {
			// Staged on another table, a thing's tags may not have been read here yet.
			await loadTags(Object.keys(tagStore.staged));
			results = (await saveTags(message)).groups;
			if (results.every((result) => !result.dryRun && !result.error)) message = '';
		} catch (error) {
			problem = error instanceof Error ? error.message : 'The changes couldn’t be saved.';
		} finally {
			saving = false;
		}
	}
</script>

<!-- The tag panel beside a table: edit the selection's tags, then review what is staged and save it. -->
{#if mode === 'review'}
	<TagReview {groups} rehearsed={tagStore.rehearsed} bind:message {summary} {saving} {results} {problem} onsave={save} ondiscard={(ref) => discard([ref])} ondiscardall={() => discard()} onback={() => (mode = 'edit')} {onclose} />
{:else}
	<TagEditor
		{targets}
		scope={selected.length ? 'selection' : 'table'}
		suggestions={tagStore.suggestions}
		staged={stagedCount()}
		{reading}
		problem={tagStore.problem}
		onadd={(tags) => stage(refs, { add: tags }, titles)}
		onremove={(tag) => stage(refs, { remove: [tag] }, titles)}
		onreview={() => {
			results = [];
			mode = 'review';
		}}
		{onclose}
	/>
{/if}
