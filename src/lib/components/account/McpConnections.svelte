<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Chip, Disclosure, Notice, Section, Switch } from '$lib/components/ui';
	import type { McpConnection, McpConnectionsState } from '$lib/mcp-servers';

	type Action = 'connect' | 'disconnect' | 'refresh' | 'writes';
	type Answer = Partial<McpConnectionsState> & { redirect?: string; error?: string };

	interface Props {
		/** The owner's CSRF token, sent with each change. */
		csrf?: string;
		/** What the sign-in callback reported: `connected` (with `server`), or `error` with a message. */
		result?: string | null;
		server?: string | null;
		message?: string | null;
		/** Leave out the section's own heading, to sit inside a group that already has one. */
		bare?: boolean;
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<McpConnectionsState>;
		act?: (action: Action, server: string, value?: boolean) => Promise<Answer>;
	}

	let { csrf, result, server, message, bare = false, load, act }: Props = $props();

	const ENDPOINT = '/api/mcp/connections';
	let info = $state<McpConnectionsState | null>(null);
	/** The service a request is out for, so only its buttons wait. */
	let busy = $state<string | null>(null);
	let notice = $state('');
	let failed = $state('');

	async function request(action?: Action, id?: string, value?: boolean): Promise<Answer> {
		const response = await fetch(ENDPOINT, {
			method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
			headers: action ? { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' } : {},
			body: action ? JSON.stringify({ action, server: id, value }) : undefined
		}).catch(() => null);
		const body = (await response?.json().catch(() => ({})) ?? {}) as Answer;
		return response?.ok ? body : { ...body, error: body.error ?? 'That didn’t go through. Try again in a moment.' };
	}

	onMount(async () => {
		const loaded = await (load ? load() : request());
		info = { configured: loaded.configured ?? false, connections: loaded.connections ?? [], ...('error' in loaded && loaded.error ? { error: loaded.error } : {}) };
	});

	async function run(action: Action, connection: McpConnection, value?: boolean) {
		busy = connection.id;
		notice = '';
		failed = '';
		const next = await (act ? act(action, connection.id, value) : request(action, connection.id, value));
		if (next.redirect) { window.location.assign(next.redirect); return; }
		busy = null;
		if (next.connections) info = { configured: next.configured ?? true, connections: next.connections };
		if (next.error) failed = next.error;
		else if (action === 'disconnect') notice = `${connection.name} is disconnected.`;
		else if (action === 'refresh') notice = `${connection.name}’s tools are up to date.`;
		else if (action === 'writes') notice = value ? `The chat can now make changes in ${connection.name}.` : `The chat can only read ${connection.name} now.`;
	}

	const date = (value: number) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
	const usable = (connection: McpConnection) => connection.connected || connection.via === 'token';
	const offered = (connection: McpConnection) => (connection.tools ?? []).filter((tool) => connection.writes || tool.reads);
	const changing = (connection: McpConnection) => (connection.tools ?? []).filter((tool) => !tool.reads).length;
	const connectedName = $derived(info?.connections.find((connection) => connection.id === server)?.name);

	function status(connection: McpConnection): string {
		if (connection.broken) return `Needs connecting again: ${connection.broken.reason}.`;
		if (connection.connected) return `Connected${connection.connectedAt ? ` ${date(connection.connectedAt)}` : ''}.`;
		if (connection.via === 'token') return connection.signIn ? 'Using the access token saved with the site. Connect to sign in as yourself instead.' : 'Connected with the access token saved with the site.';
		if (!connection.signIn) return `${connection.name} has no sign-in for sites like this one. It needs its access token saved with the site.`;
		return 'Not connected.';
	}
</script>

{#snippet body()}
	<p>Services your own chats can ask directly, signed in as you. Visitors’ chats never get them, and what they return stays out of anything a visitor can read.</p>
	{#if result === 'connected'}<Notice>{connectedName ?? 'The service'} is connected. Your next chat message can use it.</Notice>{/if}
	{#if result === 'error'}<Notice tone="error">{message || 'That service could not be connected.'}</Notice>{/if}
	{#if failed}<Notice tone="error">{failed}</Notice>{/if}
	{#if !info}
		<p class="hint">Checking connections…</p>
	{:else if info.error && !info.connections.length}
		<Notice tone="error">{info.error}</Notice>
	{:else if !info.configured}
		<Notice>Connections need the site’s private storage (<code>PUBLISHING_STATE</code>), which isn’t set up here.</Notice>
	{:else}
		<ul class="services">
			{#each info.connections as connection (connection.id)}
				{@const waiting = busy === connection.id}
				<li class="service" aria-busy={waiting}>
					<div class="about">
						<strong>{connection.name}</strong>
						<span class="summary">{connection.summary}</span>
						<span class="state" class:broken={connection.broken}>{status(connection)}</span>
					</div>
					<div class="actions">
						{#if connection.connected}
							<Button size="sm" variant="quiet" disabled={!!busy} onclick={() => run('disconnect', connection)}>Disconnect</Button>
						{:else if connection.signIn}
							<Button size="sm" variant={connection.via === 'token' ? 'secondary' : 'primary'} disabled={!!busy} onclick={() => run('connect', connection)}>{waiting ? `Opening ${connection.name}…` : connection.broken ? 'Reconnect' : 'Connect'}</Button>
						{/if}
					</div>
					{#if usable(connection)}
						<div class="more">
							{#if connection.tools?.length}
								<Disclosure>
									{#snippet summary()}{offered(connection).length} of {connection.tools?.length} tools open to the chat{/snippet}
									<div class="tools">
										{#each connection.tools as tool (tool.name)}
											<Chip variant="soft" class={connection.writes || tool.reads ? '' : 'withheld'} title={tool.reads ? 'Reads' : connection.writes ? 'Makes changes' : 'Makes changes: off'}>{tool.name}</Chip>
										{/each}
									</div>
									<div class="tools-foot">
										{#if connection.toolsAt}<span class="hint">Listed {date(connection.toolsAt)}.</span>{/if}
										<Button size="sm" variant="quiet" disabled={!!busy} onclick={() => run('refresh', connection)}>Check for new tools</Button>
									</div>
								</Disclosure>
							{:else}
								<span class="hint">Its tools haven’t been listed yet.</span>
								<Button size="sm" variant="quiet" disabled={!!busy} onclick={() => run('refresh', connection)}>List them</Button>
							{/if}
							{#if !connection.tools?.length || changing(connection)}
								<Switch checked={connection.writes} disabled={!!busy} onCheckedChange={(next: boolean) => run('writes', connection, next)}>Let the chat make changes{changing(connection) ? ` (${changing(connection)} more tools)` : ''}</Switch>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p class="status" role="status" aria-live="polite">{notice}</p>
{/snippet}

<!-- The MCP servers the site's chat can use as Casey: sign in, see what each offers, and decide whether it may change things. -->
<div id="connections-chat">
	{#if bare}{@render body()}{:else}<Section title="Chat connections">{@render body()}</Section>{/if}
</div>

<style>
	.services {
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.service {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-2) var(--space-4);
		align-items: start;
		padding: var(--space-3) 0;
		border-top: 1px solid var(--border-subtle);
	}

	.about {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.summary,
	.state,
	.hint,
	.status {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.state {
		color: var(--text-secondary);
	}

	.state.broken {
		color: var(--text-primary);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}

	.more {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		grid-column: 1 / -1;
		font-size: var(--fs-sm);
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: var(--space-2) 0;
	}

	.tools :global(.withheld) {
		opacity: 0.45;
		text-decoration: line-through;
	}

	.tools-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.status:empty {
		display: none;
	}
</style>
