<script module lang="ts">
	/** What `/api/subscribe` answers, and what a `submit` stand-in returns. */
	export type SubscribeOutcome =
		| { ok: true; status: 'subscribed' | 'already' }
		| { ok: false; status: 'invalid' | 'unavailable' | 'failed'; message: string };

	async function post(action: string, email: string): Promise<SubscribeOutcome> {
		try {
			const response = await fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
			return (await response.json()) as SubscribeOutcome;
		} catch {
			return { ok: false, status: 'failed', message: 'That didn’t go through. Try again in a moment.' };
		}
	}
</script>

<script lang="ts">
	import { Field, FieldDescription, FieldError, FieldLabel } from '@ui-sdk/svelte/field';
	import { Input } from '@ui-sdk/svelte/input';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Where the address goes. The page's own Worker endpoint, which holds the Buttondown key. */
		action?: string;
		label?: string;
		/** A quiet line under the field, such as how often letters go out. */
		hint?: string;
		buttonLabel?: string;
		/** Hides the label visually, for a form whose context already says what it is. */
		hideLabel?: boolean;
		/** Stand-in for the request, for stories and tests. */
		submit?: (email: string) => Promise<SubscribeOutcome>;
		/** The answer to a form sent without JavaScript, read back from `?subscribe=` by the page. */
		initial?: SubscribeOutcome['status'] | 'confirmed';
	}

	let { action = '/api/subscribe', label = 'Get new posts by email', hint, buttonLabel = 'Subscribe', hideLabel = false, submit, initial }: Props = $props();

	const FALLBACK: Record<string, string> = {
		invalid: 'That doesn’t look like an email address.',
		unavailable: 'Email signup isn’t set up here yet.',
		failed: 'That didn’t go through. Try again in a moment.'
	};

	let email = $state('');
	let sending = $state(false);
	// svelte-ignore state_referenced_locally
	let done = $state<'subscribed' | 'already' | 'confirmed' | null>(initial === 'subscribed' || initial === 'already' || initial === 'confirmed' ? initial : null);
	// svelte-ignore state_referenced_locally
	let error = $state(initial && FALLBACK[initial] ? FALLBACK[initial] : '');

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		sending = true;
		error = '';
		const value = email.trim();
		const outcome = await (submit ? submit(value) : post(action, value));
		sending = false;
		if (outcome.ok) done = outcome.status;
		else error = outcome.message || FALLBACK[outcome.status];
	}

	function again() {
		done = null;
		email = '';
	}
</script>

{#if done}
	<div class="subscribe-form subscribe-form--done" role="status">
		<Icon name="status" size={18} />
		<p>
			{#if done === 'confirmed'}<strong>You’re subscribed.</strong> New posts will come by email.{:else if done === 'already'}<strong>You’re already on the list.</strong> Thanks for reading.{:else}<strong>Check your inbox</strong> to confirm {email || 'your address'}.{/if}
			<button type="button" class="again" onclick={again}>Use another address</button>
		</p>
	</div>
{:else}
	<form class="subscribe-form" method="post" {action} {onsubmit}>
		<Field name="email" invalid={error ? true : undefined}>
			<FieldLabel class={hideLabel ? 'visually-hidden' : 'subscribe-form-label'}>{label}</FieldLabel>
			<div class="row">
				<Input class="text-field-control subscribe-form-input" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" bind:value={email} onValueChange={() => (error = '')} disabled={sending} />
				<Button type="submit" variant="primary" disabled={sending}>{sending ? 'Sending…' : buttonLabel}</Button>
			</div>
			<FieldError class="subscribe-form-error" match={error ? true : undefined}>
				{#snippet children(state)}{error || state.message}{/snippet}
			</FieldError>
			{#if hint && !error}<FieldDescription class="subscribe-form-hint">{hint}</FieldDescription>{/if}
		</Field>
		<!-- Left empty by people, filled by bots; the server pretends a filled one worked. -->
		<input class="trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
	</form>
{/if}

<style>
	.subscribe-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	:global(.subscribe-form-label) {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	:global(.subscribe-form-input) {
		flex: 1;
		min-width: 0;
	}

	:global(.subscribe-form-input::placeholder) {
		color: var(--text-muted);
	}

	:global(.subscribe-form-error),
	:global(.subscribe-form-hint) {
		margin: var(--space-1) 0 0;
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
	}

	:global(.subscribe-form-error) {
		color: var(--text-primary);
	}

	:global(.subscribe-form-hint) {
		color: var(--text-muted);
	}

	.trap {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		opacity: 0;
		pointer-events: none;
	}

	.subscribe-form--done {
		flex-direction: row;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.subscribe-form--done p {
		margin: 0;
	}

	.again {
		display: block;
		margin-top: var(--space-1);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-xs);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	@media (hover: hover) {
		.again:hover {
			color: var(--text-primary);
		}
	}
</style>
