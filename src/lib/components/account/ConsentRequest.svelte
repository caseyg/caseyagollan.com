<script lang="ts">
	import { Button, Checkbox, CheckboxGroup, Heading, Section } from '$lib/components/ui';
	import { SCOPES, hostOf } from './scopes';

	interface Props {
		/** The app's address (its IndieAuth client_id). */
		clientId: string;
		/** Where the owner is sent back to. */
		redirectUri: string;
		/** The permissions the app asked for. Empty when it only wants to know who is signing in. */
		scope: string[];
		/** The permissions still ticked. Supports bind:selected. */
		selected?: string[];
		busy?: boolean;
		onallow: () => void;
		/** Where Cancel goes. */
		cancelHref?: string;
	}

	let { clientId, redirectUri, scope, selected = $bindable([...scope]), busy = false, onallow, cancelHref = '/account' }: Props = $props();

	const app = $derived(hostOf(clientId));
	const elsewhere = $derived(hostOf(redirectUri) !== app);
	const identityOnly = $derived(scope.length === 0);
</script>

<!-- One decision on its own page: an app asking to sign the owner in, or to act for them. -->
<Section title={identityOnly ? `Sign in to ${app}?` : `Let ${app} use your site?`} variant="card">
	<p>{identityOnly ? 'It will learn that you are the owner of this site, and nothing else.' : 'It will be able to do only what you leave ticked.'}</p>
	{#if !identityOnly}
		<Heading level={3} size="label" class="consent-label">Permissions</Heading>
		<CheckboxGroup label="Requested permissions" bind:value={selected} disabled={busy}>
			{#each scope as name (name)}<Checkbox value={name}><strong>{name}</strong> · {SCOPES[name] ?? 'Requested permission'}</Checkbox>{/each}
		</CheckboxGroup>
	{/if}
	<dl class="addresses">
		<dt>App</dt><dd>{clientId}</dd>
		<dt>Returns to</dt><dd>{redirectUri}{#if elsewhere}<span class="elsewhere"> · a different address from the app’s</span>{/if}</dd>
	</dl>
	<div class="actions">
		<Button variant="primary" disabled={busy} onclick={onallow}>{busy ? 'Please wait…' : identityOnly ? 'Sign in' : 'Allow access'}</Button>
		<Button href={cancelHref} variant="quiet">Cancel</Button>
	</div>
</Section>

<style>
	:global(.consent-label) {
		margin: var(--space-4) 0 var(--space-2);
	}

	.addresses {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-1) var(--space-4);
		margin: var(--space-5) 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--fs-sm);
	}

	dt {
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	.elsewhere {
		color: var(--text-primary);
		font-weight: var(--fw-medium);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
</style>
