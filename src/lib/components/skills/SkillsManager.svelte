<script lang="ts">
	import { onMount } from 'svelte';
	import { ORIGIN_LABELS, parseSkillFile, skillName, type RegistrySkill, type Skill, type SkillProposal, type SkillProposalSet, type SkillSummary } from '$lib/chat-skills';
	import { skillsApi, type SkillsClient } from '$lib/chat-skills-client';
	import { Button, InlineForm, Notice, Row, RowList, Section, Switch } from '$lib/components/ui';
	import SkillForm from './SkillForm.svelte';
	import SkillReview from './SkillReview.svelte';
	import SkillSetReview from './SkillSetReview.svelte';

	interface Props {
		client?: SkillsClient;
		/** Skills to show before the list is read, for stories. */
		skills?: SkillSummary[];
		/** The view to open in, for stories. */
		view?: View;
	}

	type View = 'list' | 'add' | 'new' | 'edit' | 'install';

	// svelte-ignore state_referenced_locally
	let { client = skillsApi, skills: initial, view: startView = 'list' }: Props = $props();

	// svelte-ignore state_referenced_locally
	let skills = $state<SkillSummary[]>(initial ?? []);
	// svelte-ignore state_referenced_locally
	let loading = $state(!initial);
	// svelte-ignore state_referenced_locally
	let view = $state<View>(startView);
	let editing = $state<(Pick<Skill, 'name' | 'description' | 'instructions'> & Partial<Skill>) | undefined>(undefined);
	/** The name `editing` is kept under, when it is a skill that already exists. */
	let editingSaved = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let upload: HTMLInputElement | undefined = $state();

	// Installing from elsewhere: an address or id, or a search of skills.sh, then the review card.
	let source = $state('');
	let found = $state<RegistrySkill[] | null>(null);
	let proposal = $state<SkillProposal | undefined>(undefined);
	/** Several fetched at once, from a repository or a plugin marketplace. */
	let set = $state<SkillProposalSet | undefined>(undefined);

	async function refresh() {
		try { skills = await client.list(); error = ''; }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Skills couldn’t be loaded.'; }
		finally { loading = false; }
	}
	onMount(() => { void refresh(); });

	async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
		if (busy) return undefined;
		busy = true; error = ''; notice = '';
		try { return await work(); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'That didn’t work. Try again.'; return undefined; }
		finally { busy = false; }
	}

	function show(next: View) { view = next; error = ''; if (next === 'list') { editing = undefined; editingSaved = ''; proposal = undefined; set = undefined; found = null; source = ''; } }

	const toggle = (skill: SkillSummary, enabled: boolean) => run(async () => {
		skills = skills.map((one) => one.name === skill.name ? { ...one, enabled } : one);
		try { await client.enable(skill.name, enabled); } catch (cause) { await refresh(); throw cause; }
	});

	const edit = (name: string) => run(async () => { editing = await client.get(name); editingSaved = name; view = 'edit'; });

	const save = (skill: Pick<Skill, 'name' | 'description' | 'instructions'>) => run(async () => {
		const existing = !!editingSaved;
		const saved = await client.save(skill, editingSaved || undefined);
		await refresh();
		show('list');
		notice = existing ? `Saved /${saved.name}.` : `Added. Type /${saved.name} in the chat to use it.`;
	});

	const remove = () => run(async () => {
		const name = editingSaved;
		await client.remove(name);
		await refresh();
		show('list');
		notice = `Deleted /${name}.`;
	});

	/** A SKILL.md from the computer fills the form in; nothing is kept until it is added there. */
	async function uploaded() {
		const file = upload?.files?.[0];
		if (upload) upload.value = '';
		if (!file) return;
		if (file.size > 300_000) { error = 'That file is too big to be a skill.'; return; }
		const parsed = parseSkillFile(await file.text());
		editing = { name: skillName(parsed.name ?? file.name.replace(/\.[^.]+$/, '').replace(/^skill$/i, '')), description: parsed.description ?? '', instructions: parsed.instructions };
		editingSaved = '';
		show('new');
	}

	const search = (query: string) => run(async () => {
		const words = query.trim();
		proposal = undefined; set = undefined;
		// An address, an id or a repository (owner/repo) is fetched; anything else is searched for.
		if (/^https:\/\//.test(words) || /^[\w.-]+\/[\w.-]+(?:[/@][\w.-]+)?$/.test(words)) { found = null; take(await client.fetch(words)); }
		else found = await client.find(words);
	});

	/** One skill gets its own card; several get one card with a tick each. */
	function take(fetched: SkillProposalSet) { if (fetched.proposals.length === 1 && !fetched.repository) proposal = fetched.proposals[0]; else set = fetched; }

	const review = (id: string) => run(async () => { set = undefined; take(await client.fetch(id)); });

	/** Some of a set were added; the card stays for the rest, and the list behind it is read again. */
	async function addedAll(names: string[]) {
		await refresh();
		notice = `Added ${names.length === 1 ? `/${names[0]}` : `${names.length} skills`}.`;
	}

	async function added(name: string) {
		await refresh();
		show('list');
		notice = `Added. Type /${name} in the chat to use it.`;
	}

	const installs = (count: number) => count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1)}M installs` : count >= 1000 ? `${Math.round(count / 1000)}K installs` : `${count} installs`;
</script>

<!--
	Casey's chat skills: what there is, each with its switch; one opens to be edited, exported or
	deleted; and the ways to add one (with the chat, by hand, from a file, from skills.sh or GitHub).
-->
<Section title="Skills">
	{#if view === 'list' || view === 'add'}
		<p class="lede">Instructions the chat follows for particular kinds of work. Type <kbd>/</kbd> in the chat to use one; the assistant also picks one up when its description fits what you ask.</p>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
		{#if error}<Notice tone="error">{error}</Notice>{/if}
		{#if loading}
			<p class="notice">Loading skills…</p>
		{:else}
			<RowList label="Skills">
				{#each skills as skill (skill.name)}
					<Row title="/{skill.name}" detail={skill.description.length > 160 ? `${skill.description.slice(0, 160).replace(/\s+\S*$/, '')}…` : skill.description}>
						{ORIGIN_LABELS[skill.origin]}{skill.origin === 'installed' && skill.source ? ` from ${skill.source.replace(/^https:\/\/(www\.)?/, '').split('/').slice(0, 3).join('/')}` : ''}
						{#snippet action()}
							<span class="row-controls">
								<Button variant="quiet" size="sm" disabled={busy} aria-label="{skill.origin === 'builtin' ? 'View' : 'Edit'} {skill.name}" onclick={() => edit(skill.name)}>{skill.origin === 'builtin' ? 'View' : 'Edit'}</Button>
								<Switch checked={skill.enabled} disabled={busy} aria-label="Use {skill.name}" onCheckedChange={(checked: boolean) => toggle(skill, checked)} />
							</span>
						{/snippet}
					</Row>
				{/each}
			</RowList>
			{#if view === 'list'}
				<Button icon="plus" onclick={() => show('add')}>Add skill</Button>
			{:else}
				<RowList label="Ways to add a skill">
					<Row href="/chat?ask={encodeURIComponent('/skill-creator ')}" title="Write one with the chat" detail="Say what you want it to do; the chat drafts it for you to review." />
					<Row title="Start from scratch" detail="Write the name, description and instructions yourself.">
						{#snippet action()}<Button size="sm" onclick={() => { editing = undefined; editingSaved = ''; show('new'); }}>Write</Button>{/snippet}
					</Row>
					<Row title="Upload a file" detail="A SKILL.md, or any Markdown file with a skill’s instructions.">
						{#snippet action()}<Button size="sm" onclick={() => upload?.click()}>Choose file</Button>{/snippet}
					</Row>
					<Row title="From skills.sh or GitHub" detail="Search the public registry, or paste the address of a skill, a repository of skills or a plugin marketplace. You read each before it is added.">
						{#snippet action()}<Button size="sm" onclick={() => show('install')}>Find</Button>{/snippet}
					</Row>
				</RowList>
				<input class="visually-hidden" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" bind:this={upload} onchange={uploaded} tabindex="-1" aria-hidden="true" />
				<Button variant="quiet" onclick={() => show('list')}>Cancel</Button>
			{/if}
		{/if}
	{:else if view === 'install'}
		<p class="lede">Search <a href="https://skills.sh" target="_blank" rel="noopener">skills.sh</a>, or paste the skills.sh or GitHub address of a skill, a repository of skills (<code>owner/repo</code>) or a plugin marketplace. Most published skills are written for coding agents with a terminal; ones that are guidance rather than commands work best here.</p>
		<InlineForm bind:value={source} name="source" label="Search or address" placeholder="writing style, or anthropics/skills/frontend-design" buttonLabel="Find" busyLabel="Looking…" {busy} onsubmit={(value) => search(value)} />
		{#if error}<Notice tone="error">{error}</Notice>{/if}
		{#if proposal}
			{#key proposal.id}
				<SkillReview skill={{ id: proposal.id, name: proposal.skill.name, description: proposal.skill.description, origin: proposal.skill.origin, source: proposal.skill.source, replaces: !!proposal.replaces }} {proposal} {client} open onadded={added} ondismissed={() => (proposal = undefined)} />
			{/key}
		{:else if set}
			{#key set.proposals[0]?.id}
				<SkillSetReview skills={set.proposals.map((one) => ({ id: one.id, name: one.skill.name, description: one.skill.description, origin: one.skill.origin, source: one.skill.source, replaces: !!one.replaces }))} from={set.repository} total={set.total} notes={set.notes} proposals={set.proposals} {client} onadded={(names) => addedAll(names)} ondismissed={() => (set = undefined)} />
			{/key}
		{:else if found}
			{#if found.length}
				<RowList label="Skills found">
					{#each found as result (result.id)}
						<Row title={result.name} detail="{result.source} · {installs(result.installs)}">
							{#snippet action()}<Button size="sm" disabled={busy} aria-label="Review {result.name}" onclick={() => review(result.id)}>Review</Button>{/snippet}
						</Row>
					{/each}
				</RowList>
			{:else}
				<p class="notice">Nothing matched. Try other words.</p>
			{/if}
		{/if}
		<Button variant="quiet" onclick={() => show('list')}>Back to skills</Button>
	{:else}
		{#key editingSaved || 'new'}
			<SkillForm skill={editing} saved={!!editingSaved} {busy} {error} onsave={save} oncancel={() => show('list')} ondelete={editingSaved ? remove : undefined} />
		{/key}
	{/if}
</Section>

<style>
	.lede {
		max-width: 44rem;
		color: var(--text-secondary);
	}

	.notice {
		margin: var(--space-2) 0;
		color: var(--text-secondary);
		font-size: var(--fs-sm);
	}

	.row-controls {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	kbd {
		font-family: var(--font-mono);
		font-size: 0.95em;
	}

	a {
		color: inherit;
		text-underline-offset: var(--underline-offset);
	}
</style>
