<script lang="ts">
	import { untrack } from 'svelte';
	import type { SkillProposal, SkillReviewRef } from '$lib/chat-skills';
	import { skillsApi, type SkillsClient } from '$lib/chat-skills-client';
	import { Button, Checkbox, Chip, Disclosure } from '$lib/components/ui';

	interface Props {
		/** The skills up for review, as the chat step (or the manager) knows them before each is fetched whole. */
		skills: SkillReviewRef[];
		/** `owner/repo` they came from. */
		from?: string;
		/** How many skills the source holds, when it holds more than are shown. */
		total?: number;
		/** What to know about the whole set: it is a marketplace, some plugins live elsewhere. */
		notes?: string[];
		/** Proposals the caller already has, by id; the rest are fetched as Casey. */
		proposals?: SkillProposal[];
		client?: SkillsClient;
		onadded?: (names: string[]) => void;
		ondismissed?: () => void;
	}

	let { skills, from, total, notes = [], proposals: given = [], client = skillsApi, onadded, ondismissed }: Props = $props();

	type Stage = 'loading' | 'waiting' | 'added' | 'gone';
	let stages = $state<Record<string, Stage>>({});
	let whole = $state<Record<string, SkillProposal>>({});
	let picked = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let dismissed = $state(false);
	let error = $state('');

	$effect(() => {
		const list = skills, have = given;
		untrack(() => {
			for (const skill of list) {
				// Unticked from the start: a box with no value yet would keep its own state.
				picked[skill.id] ??= false;
				const known = have.find((proposal) => proposal.id === skill.id);
				if (known) { whole[skill.id] = known; stages[skill.id] = 'waiting'; continue; }
				stages[skill.id] = 'loading';
				void client.pending(skill.id, skill.name).then((found) => {
					if ('skill' in found) { whole[skill.id] = found; stages[skill.id] = 'waiting'; }
					else stages[skill.id] = found.added ? 'added' : 'gone';
				}).catch(() => { stages[skill.id] = 'gone'; });
			}
		});
	});

	const waiting = $derived(skills.filter((skill) => stages[skill.id] === 'waiting'));
	const chosen = $derived(waiting.filter((skill) => picked[skill.id]));
	const loading = $derived(skills.some((skill) => stages[skill.id] === 'loading' || stages[skill.id] === undefined));
	const addedCount = $derived(skills.filter((skill) => stages[skill.id] === 'added').length);
	const more = $derived(total && total > skills.length ? total - skills.length : 0);

	function pickAll(on: boolean) { for (const skill of waiting) picked[skill.id] = on; }

	async function add() {
		if (busy || !chosen.length) return;
		busy = true; error = '';
		const names: string[] = [];
		// One at a time: each is its own skill, and one failing shouldn't lose the others.
		for (const skill of chosen) {
			try { await client.add(skill.id); stages[skill.id] = 'added'; picked[skill.id] = false; names.push(skill.name); }
			catch (cause) { error = `${skill.name}: ${cause instanceof Error ? cause.message : 'that didn’t work.'}`; }
		}
		busy = false;
		if (names.length) onadded?.(names);
	}

	async function dismiss() {
		if (busy) return;
		busy = true;
		await Promise.all(waiting.map((skill) => client.dismiss(skill.id).then(() => { stages[skill.id] = 'gone'; }).catch(() => undefined)));
		busy = false; dismissed = true; ondismissed?.();
	}
</script>

<!--
	Several skills put in front of Casey at once, from a repository or a plugin marketplace. Each is
	read, ticked and added by itself: nothing is added that Casey didn't tick.
-->
<article class="skill-set" aria-label="Skills to review{from ? ` from ${from}` : ''}">
	<header>
		<span class="title">{skills.length} skills{from ? ` from ${from}` : ''}</span>
		<Chip>From elsewhere</Chip>
	</header>
	<p class="note">These were written by someone else. Read the ones you want before adding them: the assistant follows a skill whenever it is used.</p>
	{#each notes as note (note)}<p class="note">{note}</p>{/each}

	{#if waiting.length > 1}
		<Checkbox checked={chosen.length === waiting.length} indeterminate={chosen.length > 0 && chosen.length < waiting.length} onCheckedChange={pickAll} disabled={busy}>All {waiting.length}</Checkbox>
	{/if}
	<ul>
		{#each skills as skill (skill.id)}
			{@const stage = stages[skill.id] ?? 'loading'}
			{@const proposal = whole[skill.id]}
			<li data-state={stage}>
				{#if stage === 'waiting'}
					<Checkbox bind:checked={picked[skill.id]} disabled={busy}><span class="name">/{skill.name}</span></Checkbox>
				{:else}
					<span class="name">/{skill.name}</span>
					<span class="status">{stage === 'added' ? 'Added' : stage === 'gone' ? 'No longer waiting' : 'Loading…'}</span>
				{/if}
				<p class="description">{proposal?.skill.description ?? skill.description}</p>
				{#if stage === 'waiting' && proposal}
					{#if proposal.replaces}<p class="note">Adding it replaces your skill of the same name.</p>{/if}
					{#each proposal.notes.slice(1) as note (note)}<p class="note">{note}</p>{/each}
					<Disclosure>
						{#snippet summary(isOpen)}{isOpen ? 'Hide' : 'Read'} the instructions ({proposal.skill.instructions.length.toLocaleString('en-US')} characters){/snippet}
						<!-- A scrolling region has to be reachable by keyboard. -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<pre class="instructions" tabindex="0" aria-label="Instructions of {skill.name}">{proposal.skill.instructions}</pre>
						{#each Object.keys(proposal.skill.files ?? {}) as path (path)}
							<Disclosure>
								{#snippet summary()}{path}{/snippet}
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<pre class="instructions" tabindex="0" aria-label={path}>{proposal.skill.files?.[path]}</pre>
							</Disclosure>
						{/each}
					</Disclosure>
				{/if}
			</li>
		{/each}
	</ul>
	{#if more}<p class="note">{more} more {more === 1 ? 'is' : 'are'} there. Ask for one by name.</p>{/if}

	{#if error}<p class="note error" role="alert">{error}</p>{/if}
	{#if waiting.length}
		<div class="actions">
			<Button variant="primary" size="sm" icon="plus" disabled={busy || !chosen.length} onclick={add}>{chosen.length ? `Add ${chosen.length} skill${chosen.length === 1 ? '' : 's'}` : 'Add skills'}</Button>
			<Button variant="quiet" size="sm" disabled={busy} onclick={dismiss}>Not now</Button>
			{#if from}<a class="source" href="https://github.com/{from}" target="_blank" rel="noopener nofollow">Where they’re from</a>{/if}
		</div>
	{:else if !loading}
		<p class="status" role="status">
			{#if addedCount}Added {addedCount}. Type <kbd>/</kbd> in the chat to use one, or <a href="/account#skills">manage your skills</a>.{:else if dismissed}None added.{:else}These are no longer waiting to be added.{/if}
		</p>
	{/if}
</article>

<style>
	.skill-set {
		display: grid;
		gap: var(--space-2);
		box-sizing: border-box;
		width: 100%;
		max-width: 34rem;
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-1);
		color: var(--text-primary);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.title {
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}

	ul {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
		padding: var(--space-2) 0;
		border-top: 1px solid var(--border);
	}

	.name {
		font-family: var(--font-mono);
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}

	p {
		margin: 0;
	}

	.description {
		color: var(--text-secondary);
	}

	.note,
	.status {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.error {
		color: var(--text-primary);
	}

	.instructions {
		box-sizing: border-box;
		max-height: 22rem;
		margin: var(--space-2) 0;
		padding: var(--space-3);
		overflow: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		line-height: var(--lh-normal);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.instructions:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.source {
		margin-inline-start: auto;
	}

	a {
		color: var(--text-secondary);
		text-underline-offset: var(--underline-offset);
	}

	kbd {
		font-family: var(--font-mono);
		font-size: 0.95em;
	}
</style>
