<script module lang="ts">
	export interface PasskeyCredential { id: string; createdAt: number; deviceType?: string; backedUp?: boolean }
</script>

<script lang="ts">
	import { Button, Row, RowList, Section } from '$lib/components/ui';
	import { accountDate } from './scopes';

	interface Props {
		credentials: PasskeyCredential[];
		busy?: boolean;
		passkeysSupported?: boolean;
		onadd: () => void;
		onremove: (id: string) => void;
	}

	let { credentials, busy = false, passkeysSupported = true, onadd, onremove }: Props = $props();
	const last = $derived(credentials.length <= 1);
</script>

<Section title="Passkeys">
	<p>Keep a second passkey so you can sign in if a device is unavailable.</p>
	<RowList label="Passkeys">
		{#each credentials as credential (credential.id)}
			<Row title="Passkey" detail={`Added ${accountDate(credential.createdAt)}${credential.backedUp ? ' · Backed up' : ''}`}>
				{#snippet action()}<Button size="sm" disabled={busy || last} aria-label={`Remove passkey added ${accountDate(credential.createdAt)}`} onclick={() => onremove(credential.id)}>Remove</Button>{/snippet}
			</Row>
		{/each}
	</RowList>
	{#if last}<p class="hint">Your last passkey must remain on your account.</p>{/if}
	<Button disabled={busy || !passkeysSupported} onclick={onadd}>Add passkey</Button>
</Section>

<style>
	.hint {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
