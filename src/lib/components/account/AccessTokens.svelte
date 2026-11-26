<script module lang="ts">
	export interface AccessToken { id: string; name?: string; clientId: string; scope?: string; createdAt: number; expiresAt: number }
</script>

<script lang="ts">
	import { Button, Checkbox, CheckboxGroup, Heading, Row, RowList, Section, TextField } from '$lib/components/ui';
	import { SCOPES, accountDate } from './scopes';

	interface Props {
		tokens: AccessToken[];
		/** A token just made, shown once so it can be copied. */
		newToken?: string;
		busy?: boolean;
		oncreate: (name: string, scope: string[]) => void | Promise<void>;
		onrevoke: (id: string) => void;
		oncopy?: () => void;
		ondismiss?: () => void;
	}

	let { tokens, newToken = '', busy = false, oncreate, onrevoke, oncopy, ondismiss }: Props = $props();

	let name = $state('');
	let scope = $state<string[]>([]);
	let creating = $state(false);

	async function create() {
		await oncreate(name, scope);
		name = '';
		scope = [];
		creating = false;
	}
</script>

<Section title="Apps and access tokens">
	<p>Tokens let apps act with the permissions you grant. Revoke one to stop its access.</p>
	{#if tokens.length}
		<RowList label="Access tokens">
			{#each tokens as token (token.id)}
				<Row title={token.name || token.clientId} detail={`${token.scope || 'Identity only'} · Created ${accountDate(token.createdAt)} · Expires ${accountDate(token.expiresAt)}`}>
					{#snippet action()}<Button size="sm" disabled={busy} aria-label={`Revoke access for ${token.name || token.clientId}`} onclick={() => onrevoke(token.id)}>Revoke</Button>{/snippet}
				</Row>
			{/each}
		</RowList>
	{:else}
		<p class="hint">No active access tokens.</p>
	{/if}
	{#if newToken}
		<div class="token">
			<TextField multiline mono label="Copy your new token now. It will not be shown again." id="new-token" readonly value={newToken} spellcheck="false" autocomplete="off" />
			<div class="actions">
				<Button variant="primary" disabled={busy} onclick={oncopy}>Copy token</Button>
				<Button variant="quiet" disabled={busy} onclick={ondismiss}>Dismiss token</Button>
			</div>
		</div>
	{/if}
	<!-- Making a token is the rare case, so its form stays away until asked for. -->
	{#if creating}
		<form class="create" onsubmit={(event) => { event.preventDefault(); void create(); }}>
			<Heading level={3} size="subtitle">New personal token</Heading>
			<TextField label="Token name (optional)" id="token-name" bind:value={name} maxlength={100} placeholder="e.g. Laptop publishing" disabled={busy} />
			<CheckboxGroup label="Token permissions" bind:value={scope} disabled={busy}>
				{#each Object.entries(SCOPES) as [key, description] (key)}<Checkbox value={key}><strong>{key}</strong> · {description}</Checkbox>{/each}
			</CheckboxGroup>
			<div class="actions">
				<Button type="submit" variant="primary" disabled={busy || !scope.length}>Create token</Button>
				<Button variant="quiet" disabled={busy} onclick={() => (creating = false)}>Cancel</Button>
			</div>
		</form>
	{:else}
		<Button disabled={busy} onclick={() => (creating = true)}>Create a personal token</Button>
	{/if}
</Section>

<style>
	.hint {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.token {
		margin: var(--space-4) 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.create {
		margin-top: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
