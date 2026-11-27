<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@ui-sdk/svelte/alert-dialog';
	import Notice from './Notice.svelte';
	// The answers are drawn as buttons, whose styles live with Button.
	import './Button.svelte';

	interface Props {
		open?: boolean;
		/** The question, such as “Delete this chat?”. */
		title: string;
		/** What agreeing does, in a sentence. */
		children: Snippet;
		/** The agreeing answer, a verb: “Delete”. */
		confirm: string;
		cancel?: string;
		/** Agreed. Return a promise and the dialog waits for it; it stays open if `error` is then set. */
		onconfirm: () => unknown;
		/** Why agreeing didn't work, shown in the dialog. */
		error?: string;
	}

	let { open = $bindable(false), title, children, confirm, cancel = 'Cancel', onconfirm, error = '' }: Props = $props();

	let busy = $state(false);

	async function agree() {
		if (busy) return;
		busy = true;
		try { await onconfirm(); } finally { busy = false; }
	}
</script>

<!--
	Asks before something that can't be undone, built on ui-sdk AlertDialog: it opens on Cancel,
	holds focus, and only an answer or Escape closes it. Open it from code with `bind:open`.
-->
<AlertDialog bind:open>
	<AlertDialogBackdrop class="confirm-dialog-backdrop" />
	<AlertDialogContent class="confirm-dialog">
		<AlertDialogTitle class="confirm-dialog-title">{title}</AlertDialogTitle>
		<AlertDialogDescription class="confirm-dialog-text">{@render children()}</AlertDialogDescription>
		{#if error}<Notice tone="error">{error}</Notice>{/if}
		<div class="confirm-dialog-answers">
			<AlertDialogClose class="button button--secondary button--md">{cancel}</AlertDialogClose>
			<button type="button" class="button button--primary button--md" disabled={busy} onclick={agree}>{confirm}</button>
		</div>
	</AlertDialogContent>
</AlertDialog>

<style>
	:global(.confirm-dialog-backdrop) {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
		transition: opacity 150ms var(--ease-out);
	}

	:global(.confirm-dialog) {
		position: fixed;
		inset: 0;
		box-sizing: border-box;
		width: min(26rem, calc(100vw - 2 * var(--space-4)));
		height: fit-content;
		margin: auto;
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		color: var(--text-primary);
		/* Opens in the top layer, outside any page's type. */
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
		box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.35);
		transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out);
	}

	:global(.confirm-dialog-backdrop:is([data-starting-style], [data-ending-style])),
	:global(.confirm-dialog:is([data-starting-style], [data-ending-style])) {
		opacity: 0;
	}

	:global(.confirm-dialog:is([data-starting-style], [data-ending-style])) {
		scale: 0.97;
	}

	:global(.confirm-dialog-title) {
		margin: 0 0 var(--space-2);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		line-height: var(--lh-snug);
	}

	:global(.confirm-dialog-text) {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		overflow-wrap: anywhere;
	}

	.confirm-dialog-answers {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.confirm-dialog-backdrop),
		:global(.confirm-dialog) {
			transition: none;
		}
	}
</style>
