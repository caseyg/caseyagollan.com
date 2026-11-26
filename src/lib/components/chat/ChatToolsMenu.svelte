<script lang="ts">
	import { groupKey, groupOn, toolKey, toolsOn, withChoice, type ChatToolChoices, type ChatToolGroup } from '$lib/chat-tool-groups';
	import { Button, Icon, Popover, Switch } from '$lib/components/ui';

	interface Props {
		/** The groups of tools this chat has, and what is off in it. */
		choices: ChatToolChoices;
		/** Called with the new list of what is off. */
		onchange: (off: string[]) => void;
		/** Where services are connected and disconnected. */
		manageHref?: string;
		align?: 'start' | 'end';
		open?: boolean;
		/** Opens inside this group, for stories. */
		inside?: string;
	}

	let { choices, onchange, manageHref = '/account#connections-chat', align = 'start', open = $bindable(false), inside }: Props = $props();

	let query = $state('');
	/** The group whose tools are listed, when Casey has gone into one. */
	let within = $state<string | null>(null);
	$effect(() => { if (inside) within = inside; });
	$effect(() => { if (!open) { query = ''; if (!inside) within = null; } });

	const group = $derived(choices.groups.find((one) => one.id === within) ?? null);
	const wanted = $derived(query.trim().toLowerCase());
	const matches = (text: string) => !wanted || text.toLowerCase().includes(wanted);
	const groups = $derived(choices.groups.filter((one) => matches(one.name) || one.tools.some((tool) => matches(tool.label) || matches(tool.name))));
	const tools = $derived(group ? group.tools.filter((tool) => matches(tool.label) || matches(tool.name)) : []);
	const own = $derived(groups.filter((one) => !one.service));
	const services = $derived(groups.filter((one) => one.service));
	const offCount = $derived(choices.groups.filter((one) => toolsOn(choices.off, one) < one.tools.length).length);

	const set = (key: string, on: boolean) => onchange(withChoice(choices.off, key, on));
	const count = (one: ChatToolGroup) => { const on = toolsOn(choices.off, one); return on === one.tools.length ? `${on} tools` : `${on} of ${one.tools.length} tools`; };
	function enter(id: string) { within = id; query = ''; }
</script>

{#snippet rows(list: ChatToolGroup[])}
	{#each list as one (one.id)}
		<li class="row">
			{#if one.tools.length > 1}
				<button type="button" class="into" onclick={() => enter(one.id)} aria-label="{one.name}: choose tools">
					<span class="name">{one.name}</span>
					<span class="detail">{count(one)}</span>
					<span class="chevron"><Icon name="chevron" size={16} /></span>
				</button>
			{:else}
				<span class="into"><span class="name">{one.name}</span><span class="detail">{one.summary ?? ''}</span></span>
			{/if}
			<Switch checked={groupOn(choices.off, one)} aria-label={one.name} onCheckedChange={(next: boolean) => set(groupKey(one.id), next)} />
		</li>
	{/each}
{/snippet}

<!-- The composer's Tools menu: turn a group of the assistant's tools, or one tool, on or off for this chat. Casey's alone. -->
<Popover label="Tools for this chat" {align} bind:open triggerClass="chat-tools-trigger" panelClass="chat-tools-panel">
	{#snippet trigger()}<Icon name="sliders" size={18} />{#if offCount}<span class="badge" title="{offCount} {offCount === 1 ? 'group' : 'groups'} changed for this chat"></span>{/if}{/snippet}
	<div class="chat-tools">
		{#if group}
			<div class="head">
				<Button variant="quiet" size="sm" onclick={() => { within = null; query = ''; }}>← All tools</Button>
				<Switch checked={groupOn(choices.off, group)} aria-label={group.name} onCheckedChange={(next: boolean) => set(groupKey(group.id), next)}>{group.name}</Switch>
			</div>
		{/if}
		<input class="search" type="search" bind:value={query} placeholder={group ? `Search ${group.name}` : 'Search tools'} aria-label={group ? `Search ${group.name}` : 'Search tools'} />
		<ul class="list">
			{#if group}
				{#each tools as tool (tool.name)}
					<li class="row">
						<span class="into"><span class="name">{tool.label}</span></span>
						<Switch checked={groupOn(choices.off, group) && !choices.off.includes(toolKey(tool.name))} disabled={!groupOn(choices.off, group)} aria-label={tool.label} onCheckedChange={(next: boolean) => set(toolKey(tool.name), next)} />
					</li>
				{:else}
					<li class="none">Nothing matches.</li>
				{/each}
			{:else}
				{@render rows(own)}
				{#if services.length}<li class="label" role="presentation">Connected services</li>{/if}
				{@render rows(services)}
				{#if !groups.length}<li class="none">Nothing matches.</li>{/if}
			{/if}
		</ul>
		<a class="manage" href={manageHref}>Manage connections <span aria-hidden="true">↗</span></a>
	</div>
</Popover>

<style>
	:global(.chat-tools-trigger) {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	:global(.chat-tools-trigger:hover),
	:global(.chat-tools-trigger[data-open]) {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	/* A dot: something is off in this chat. */
	.badge {
		position: absolute;
		top: 0.2rem;
		right: 0.2rem;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: var(--radius-full);
		background: var(--accent);
	}

	:global(.chat-tools-panel) {
		width: min(22rem, calc(100vw - 1rem));
		padding: 0;
	}

	.chat-tools {
		display: flex;
		flex-direction: column;
		font-size: var(--fs-sm);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) 0 var(--space-1);
		font-weight: 600;
	}

	.search {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-bottom: 1px solid var(--border-subtle);
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.list {
		max-height: min(20rem, 50vh);
		margin: 0;
		padding: var(--space-1) 0;
		overflow-y: auto;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3) 0 var(--space-1);
	}

	.into {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	button.into {
		cursor: pointer;
	}

	button.into:hover,
	button.into:focus-visible {
		background: var(--surface-sunken);
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail {
		flex: 1;
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		display: inline-flex;
		align-self: center;
		color: var(--text-muted);
		rotate: -90deg;
	}

	.label,
	.none {
		padding: var(--space-2) var(--space-3) var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.manage {
		display: flex;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--border-subtle);
		color: inherit;
		text-decoration: none;
	}

	.manage:hover {
		background: var(--surface-sunken);
	}
</style>
