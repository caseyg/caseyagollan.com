<script lang="ts">
	import { untrack } from 'svelte';
	import type { SkillProposal, SkillReviewRef } from '$lib/chat-skills';
	import { skillsApi, type SkillsClient } from '$lib/chat-skills-client';
	import { Button, Chip, Disclosure } from '$lib/components/ui';

	interface Props {
		/** The skill up for review: what the chat step (or the manager) knows before the rest is fetched. */
		skill: SkillReviewRef;
		/** The whole proposal, when the caller already has it; otherwise it is fetched as Casey. */
		proposal?: SkillProposal;
		client?: SkillsClient;
		/** The instructions open from the start, as on the manager where reading them is the point. */
		open?: boolean;
		onadded?: (name: string) => void;
		ondismissed?: () => void;
	}

	let { skill, proposal: given, client = skillsApi, open = $bindable(false), onadded, ondismissed }: Props = $props();

	/** `waiting`: can be added. `added`, `dismissed`: done here. `gone`: no longer waiting (stale, or not Casey). */
	let stage = $state<'loading' | 'waiting' | 'added' | 'dismissed' | 'gone'>('loading');
	let proposal = $state<SkillProposal | undefined>(undefined);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		const id = skill.id, named = skill.name, have = given;
		untrack(() => {
			if (have) { proposal = have; stage = 'waiting'; return; }
			stage = 'loading';
			void client.pending(id, named).then((found) => {
				if (id !== skill.id) return;
				if ('skill' in found) { proposal = found; stage = 'waiting'; }
				else stage = found.added ? 'added' : 'gone';
			}).catch(() => { stage = 'gone'; });
		});
	});

	const host = $derived.by(() => { try { return skill.source ? new URL(skill.source).host.replace(/^www\./, '') : ''; } catch { return ''; } });
	const files = $derived(Object.keys(proposal?.skill.files ?? {}));
	const length = $derived(proposal ? `${proposal.skill.instructions.length.toLocaleString('en-US')} characters` : '');

	async function add() {
		if (busy) return;
		busy = true; error = '';
		try { await client.add(skill.id); stage = 'added'; onadded?.(skill.name); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'That didn’t work. Try again.'; }
		finally { busy = false; }
	}

	async function dismiss() {
		if (busy) return;
		busy = true;
		try { await client.dismiss(skill.id); } catch { /* It goes stale by itself. */ }
		busy = false; stage = 'dismissed'; ondismissed?.();
	}
</script>

<!--
	A skill put in front of Casey: what it is, where it is from, and every word of it to read, before
	it becomes something the assistant follows. Adding is Casey's press of the button, nothing else.
-->
<article class="skill-review" data-state={stage} aria-label="Skill to review: {skill.name}">
	<header>
		<span class="name">/{skill.name}</span>
		<Chip>{skill.origin === 'installed' ? (host ? `From ${host}` : 'From elsewhere') : skill.replaces ? 'Changes yours' : 'Drafted here'}</Chip>
	</header>
	<p class="description">{proposal?.skill.description ?? skill.description}</p>

	{#if stage === 'waiting' && proposal}
		{#if proposal.replaces || skill.replaces}<p class="note">Adding it replaces your skill of the same name.</p>{/if}
		{#each proposal.notes as note (note)}<p class="note">{note}</p>{/each}
		<Disclosure bind:open>
			{#snippet summary(isOpen)}{isOpen ? 'Hide' : 'Read'} the instructions ({length}){/snippet}
			<!-- A scrolling region has to be reachable by keyboard. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre class="instructions" tabindex="0" aria-label="Instructions">{proposal.skill.instructions}</pre>
			{#each files as path (path)}
				<Disclosure>
					{#snippet summary()}{path}{/snippet}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<pre class="instructions" tabindex="0" aria-label={path}>{proposal.skill.files?.[path]}</pre>
				</Disclosure>
			{/each}
		</Disclosure>
		{#if error}<p class="note error" role="alert">{error}</p>{/if}
		<div class="actions">
			<Button variant="primary" size="sm" icon="plus" disabled={busy} onclick={add}>{proposal.replaces ? 'Replace skill' : 'Add skill'}</Button>
			<Button variant="quiet" size="sm" disabled={busy} onclick={dismiss}>Not now</Button>
			{#if skill.source}<a class="source" href={skill.source} target="_blank" rel="noopener nofollow">Where it’s from</a>{/if}
		</div>
	{:else if stage === 'added'}
		<p class="status" role="status">Added. Type <kbd>/{skill.name}</kbd> in the chat to use it, or <a href="/account#skills">manage your skills</a>.</p>
	{:else if stage === 'dismissed'}
		<p class="status" role="status">Not added.</p>
	{:else if stage === 'gone'}
		<p class="status">This is no longer waiting to be added.</p>
	{:else}
		<p class="status">Loading…</p>
	{/if}
</article>

<style>
	.skill-review {
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
