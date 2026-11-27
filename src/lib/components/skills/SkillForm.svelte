<script lang="ts">
	import { checkSkill, skillFile, skillName, SKILL_DESCRIPTION_MAX, SKILL_INSTRUCTIONS_MAX, type Skill } from '$lib/chat-skills';
	import { Button, Notice, TextField } from '$lib/components/ui';

	interface Props {
		/** The skill being edited; left out, a new one. */
		skill?: Pick<Skill, 'name' | 'description' | 'instructions'> & Partial<Pick<Skill, 'origin' | 'source' | 'files'>>;
		/** Whether `skill` is already kept (so it can be exported and deleted), or only filled in from a file. */
		saved?: boolean;
		busy?: boolean;
		error?: string;
		onsave: (skill: Pick<Skill, 'name' | 'description' | 'instructions'>) => void;
		oncancel: () => void;
		ondelete?: () => void;
	}

	let { skill, saved = false, busy = false, error = '', onsave, oncancel, ondelete }: Props = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(skill?.name ?? '');
	// svelte-ignore state_referenced_locally
	let description = $state(skill?.description ?? '');
	// svelte-ignore state_referenced_locally
	let instructions = $state(skill?.instructions ?? '');
	let confirming = $state(false);

	/** A built-in skill is read here, not changed: it ships with the site. */
	const fixed = $derived(skill?.origin === 'builtin');
	const checked = $derived(checkSkill({ name, description, instructions }));
	const problem = $derived('error' in checked && (name || description || instructions) && name && description.trim() && instructions.trim() ? checked.error : '');
	const ready = $derived(!('error' in checked) && instructions.length <= SKILL_INSTRUCTIONS_MAX && description.length <= SKILL_DESCRIPTION_MAX && !busy);
	const files = $derived(Object.keys(skill?.files ?? {}));
	const exported = $derived(`data:text/markdown;charset=utf-8,${encodeURIComponent(skillFile({ name: name || 'skill', description, instructions }))}`);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (ready && !('error' in checked)) onsave(checked.skill);
	}
</script>

<!-- One skill, as the Agent Skills format has it: a name (its slash command), when to use it, and what to do. -->
<form class="skill-form" onsubmit={submit}>
	{#if fixed}
		<Notice>This skill comes with the site, so it can be turned off but not changed. {#if skill?.source}It is adapted from <a href={skill.source} target="_blank" rel="noopener">{new URL(skill.source).host.replace(/^www\./, '')}</a>.{/if}</Notice>
	{:else if skill?.origin === 'installed' && skill.source}
		<Notice>Installed from <a href={skill.source} target="_blank" rel="noopener nofollow">{skill.source.replace(/^https:\/\/(www\.)?/, '')}</a>. Changes you make here stay here.</Notice>
	{/if}
	<TextField
		label="Name"
		bind:value={() => name, (next) => (name = next.toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'))}
		mono
		placeholder="link-roundup"
		hint={name ? `Type /${skillName(name) || name} in the chat to use it.` : 'Lowercase words joined by hyphens. It is also the slash command.'}
		maxlength={64}
		autocapitalize="off"
		autocomplete="off"
		spellcheck={false}
		readonly={fixed}
		required
	/>
	<TextField
		label="Description"
		bind:value={description}
		multiline
		rows={2}
		placeholder="Write a link roundup post from recent bookmarks. Use when I ask for a roundup or a links post."
		hint={description.length > SKILL_DESCRIPTION_MAX ? `${description.length.toLocaleString('en-US')} of ${SKILL_DESCRIPTION_MAX.toLocaleString('en-US')} characters` : 'What it does and when to use it. The assistant picks a skill by this line alone.'}
		readonly={fixed}
		required
	/>
	<TextField
		label="Instructions"
		bind:value={instructions}
		multiline
		mono
		rows={10}
		placeholder={'# Link roundup\n\n1. Find this week’s bookmarks and likes with search_site.\n2. Group them by theme…'}
		hint={instructions.length > SKILL_INSTRUCTIONS_MAX ? `${instructions.length.toLocaleString('en-US')} of ${SKILL_INSTRUCTIONS_MAX.toLocaleString('en-US')} characters: too long for the chat’s model.` : 'Markdown. Say what to do step by step, and why.'}
		readonly={fixed}
		required
	/>
	{#if files.length}<p class="files">Reference files kept with it: {files.join(', ')}</p>{/if}
	{#if error || problem}<Notice tone="error">{error || problem}</Notice>{/if}
	<div class="actions">
		{#if !fixed}<Button variant="primary" type="submit" disabled={!ready}>{saved ? 'Save' : 'Add skill'}</Button>{/if}
		<Button variant={fixed ? 'secondary' : 'quiet'} disabled={busy} onclick={oncancel}>{fixed ? 'Done' : 'Cancel'}</Button>
		{#if saved}
			<span class="more">
				<Button variant="quiet" href={exported} download="{name || 'skill'}.md">Export</Button>
				{#if ondelete && !fixed}
					{#if confirming}
						<Button variant="quiet" disabled={busy} onclick={ondelete}>Delete for good</Button>
						<Button variant="quiet" disabled={busy} onclick={() => (confirming = false)}>Keep</Button>
					{:else}
						<Button variant="quiet" disabled={busy} onclick={() => (confirming = true)}>Delete</Button>
					{/if}
				{/if}
			</span>
		{/if}
	</div>
</form>

<style>
	.skill-form {
		max-width: 44rem;
	}

	.skill-form :global(textarea.text-field-control) {
		max-height: 60vh;
	}

	.files {
		margin: var(--space-2) 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}

	.more {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-inline-start: auto;
	}
</style>
