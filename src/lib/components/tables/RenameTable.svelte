<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Popover from '../ui/Popover.svelte';
	import TextField from '../ui/TextField.svelte';

	interface Props {
		name: string;
		/** What the panel opens against, such as the table's name in the trail. */
		anchor?: HTMLElement | { x: number; y: number } | null;
		open?: boolean;
		onrename: (name: string) => void;
	}

	let { name, anchor, open = $bindable(false), onrename }: Props = $props();

	let draft = $state('');
	$effect(() => {
		if (open) draft = name;
	});

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		const next = draft.replace(/\s+/g, ' ').trim();
		if (next && next !== name) onrename(next);
		open = false;
	}
</script>

<Popover label="Rename table" {anchor} bind:open panelClass="rename-table">
	<form class="form" {onsubmit}>
		<!-- svelte-ignore a11y_autofocus -->
		<TextField label="Table name" bind:value={draft} maxlength={120} autofocus required />
		<div class="buttons">
			<Button variant="quiet" size="sm" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>Rename</Button>
		</div>
	</form>
</Popover>

<style>
	:global(.rename-table) {
		width: min(20rem, calc(100vw - 2 * var(--space-4)));
	}

	.form {
		padding: var(--space-1) var(--space-3) var(--space-3);
	}

	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
