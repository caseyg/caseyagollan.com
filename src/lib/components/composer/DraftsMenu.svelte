<script lang="ts">
	import Icon, { type IconName } from '../ui/Icon.svelte';
	import Button from '../ui/Button.svelte';
	import Popover from '../ui/Popover.svelte';
	import { COMPOSER_KINDS, type ComposerKind } from '$lib/composer-kinds';
	import { POST_TYPE_PLURALS } from '$lib/posts-types';
	import { formatAbsoluteDate } from '$lib/utils/formatDate';

	/** A draft the composer saved to the private drafts repository. */
	interface ComposerDraft { id: string; kind: ComposerKind; title: string; updated: string }
	/** A post marked draft in the content repository, on the published branch or a pull request. */
	interface ContentDraft { path: string; folder: string; title: string; date: string; pull?: { number: number; title: string } }
	interface ContentDrafts { drafts: ContentDraft[]; error?: string }
	interface Props {
		/** Composer drafts. Leave out when the private drafts repository is not configured. */
		drafts?: ComposerDraft[];
		/** Why the composer drafts could not be listed. */
		error?: string;
		/** Content repository drafts. A promise shows a loading line until it settles. */
		content?: ContentDrafts | Promise<ContentDrafts>;
		/** The composer draft open in the form. */
		currentId?: string;
		/** Sent with the discard form. */
		csrf: string;
	}
	let { drafts, error = '', content, currentId, csrf }: Props = $props();

	const KIND_ICONS = Object.fromEntries(Object.entries(COMPOSER_KINDS).map(([kind, details]) => [kind, details.icon])) as Record<ComposerKind, IconName>;
	const FOLDER_ICONS: Record<string, IconName> = Object.fromEntries(Object.entries(COMPOSER_KINDS).map(([kind, details]) => [POST_TYPE_PLURALS[kind], details.icon]));

	let loaded = $state<ContentDrafts>();
	$effect(() => {
		const pending = content;
		loaded = undefined;
		if (!pending) return;
		let current = true;
		Promise.resolve(pending).then(value => { if (current) loaded = value; }, () => { if (current) loaded = { drafts: [], error: 'Drafts in the content repository could not be loaded.' }; });
		return () => { current = false; };
	});
	const count = $derived((drafts?.length ?? 0) + (loaded?.drafts.length ?? 0));
</script>

<Popover panelClass="drafts-panel" align="end" label="Drafts ({count})">
	{#snippet trigger()}<Icon name="drafts" size={18} /><span class="count-badge">{count}</span>{/snippet}
	<!-- Full page loads: opening a draft must start the form from the draft, not the current state. -->
	<div class="draft-list" data-sveltekit-reload>
		{#if drafts}
			{#if content}<h3>Saved from the composer</h3>{/if}
			{#if error}<p class="hint">{error}</p>
			{:else if !drafts.length}<p class="hint">No drafts yet. “Save draft” keeps a post in your private drafts repository.</p>
			{:else}
				<ul>
					{#each drafts as draft (draft.id)}
						<li class:current={draft.id === currentId}>
							<a href="/new/{draft.kind}/?draft={draft.id}"><Icon name={KIND_ICONS[draft.kind]} size={16} /><span><strong>{draft.title}</strong><small>Saved {formatAbsoluteDate(draft.updated)}</small></span></a>
							<form method="POST" action="?/discard">
								<input type="hidden" name="csrf" value={csrf} />
								<input type="hidden" name="id" value={draft.id} />
								<Button variant="icon" size="sm" icon="close" type="submit" label="Discard {draft.title}" />
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
		{#if content}
			<h3>In the content repository</h3>
			{#if !loaded}<p class="hint" role="status">Looking on GitHub…</p>
			{:else}
				{#if loaded.error}<p class="hint">{loaded.error}</p>{/if}
				{#if loaded.drafts.length}
					<ul>
						{#each loaded.drafts as draft (draft.path)}
							<li>
								<a href="{draft.path}edit/{draft.pull ? `?pr=${draft.pull.number}` : ''}">
									<Icon name={FOLDER_ICONS[draft.folder] ?? 'note'} size={16} />
									<span><strong>{draft.title}</strong><small>{draft.pull ? `Pull request #${draft.pull.number}` : 'Marked draft'} · {formatAbsoluteDate(draft.date)}</small></span>
								</a>
							</li>
						{/each}
					</ul>
				{:else if !loaded.error}<p class="hint">No posts are marked draft there.</p>{/if}
			{/if}
		{/if}
	</div>
</Popover>

<style>
	.count-badge { min-width: 1em; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
	h3 { margin: var(--space-2) var(--space-2) var(--space-1); color: var(--text-muted); font-size: var(--fs-xs); font-weight: var(--fw-medium); }
	ul + h3, .hint + h3 { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border); }
	ul { margin: 0; padding: 0; list-style: none; }
	a { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2); border-radius: var(--radius-sm); color: inherit; text-decoration: none; }
	a:hover { background: var(--surface-2); }
	a span { display: flex; flex-direction: column; min-width: 0; font-size: var(--fs-sm); line-height: var(--lh-snug); }
	small { color: var(--text-muted); font-size: var(--fs-xs); }
	li { display: flex; align-items: center; gap: var(--space-1); }
	li > a { flex: 1; min-width: 0; }
	strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	li.current { background: var(--surface-1); border-radius: var(--radius-sm); }
	.hint { margin: var(--space-2); color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-normal); }
</style>
