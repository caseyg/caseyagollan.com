<script lang="ts">
	import { Button, Notice, SegmentedPill, TextField, type Segment } from '$lib/components/ui';

	type Provider = 'indieauth' | 'mastodon' | 'bluesky';

	interface Props {
		/** The /chat page to come back to. */
		returnTo?: string;
		/** Why the last sign-in didn't work. */
		error?: string | null;
		/** Opens with the choices showing, rather than the one button. */
		open?: boolean;
		provider?: Provider;
	}

	let { returnTo = '/chat', error = null, open = $bindable(false), provider = $bindable('indieauth') }: Props = $props();

	const segments: Segment[] = [
		{ label: 'Website', icon: '🌐', value: 'indieauth' },
		{ label: 'Mastodon', icon: '🐘', value: 'mastodon' },
		{ label: 'Bluesky', icon: '🦋', value: 'bluesky' }
	];
	const FIELD: Record<Provider, { label: string; placeholder: string; hint: string; type: string }> = {
		indieauth: { label: 'Your website', placeholder: 'example.com', hint: 'Signs in with IndieAuth. Your site needs an IndieAuth server.', type: 'url' },
		mastodon: { label: 'Your Mastodon server', placeholder: 'mastodon.social or @you@mastodon.social', hint: 'Only your name and picture are read; the access is revoked right after.', type: 'text' },
		bluesky: { label: 'Your Bluesky handle', placeholder: 'you.bsky.social', hint: 'Signs in with Bluesky; nothing is posted.', type: 'text' }
	};
	const field = $derived(FIELD[provider]);
</script>

<!-- Readers see one button; choosing it shows the three ways in. Each form posts to /chat/login/<way>. -->
<div class="chat-signin">
	{#if error}<Notice tone="error">{error}</Notice>{/if}
	{#if !open}
		<div class="closed">
			<span class="lede">Anyone can read along. Sign in to take part.</span>
			<Button variant="primary" size="sm" onclick={() => (open = true)}>Sign in</Button>
		</div>
	{:else}
		<form method="POST" action="/chat/login/{provider}">
			<div class="choose">
				<span class="lede">Sign in with</span>
				<SegmentedPill {segments} bind:value={provider} label="Sign in with" size="sm" />
			</div>
			<input type="hidden" name="return" value={returnTo} />
			<TextField label={field.label} name="address" placeholder={field.placeholder} hint={field.hint} type={field.type} required autocomplete={provider === 'indieauth' ? 'url' : 'username'} autocapitalize="off" spellcheck="false" />
			<div class="actions">
				<Button variant="quiet" size="sm" onclick={() => (open = false)}>Cancel</Button>
				<Button variant="primary" size="sm" type="submit">Continue</Button>
			</div>
		</form>
	{/if}
</div>

<style>
	.chat-signin {
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
	}

	.closed,
	.choose {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.lede {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
