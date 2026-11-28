<script lang="ts">
	import { untrack } from 'svelte';
	import { mindMapKeys } from '$lib/table-mindmap';
	import Button from '../ui/Button.svelte';
	import Keys from '../ui/Keys.svelte';

	interface Props {
		/** Whether the table is in mind map mode; out of it there is no help and `?` is left alone. */
		active?: boolean;
		/** Whether the list shows. Turning the mode on shows it, unless it was closed the last time. */
		open?: boolean;
		/** Modifier keys as a Mac prints them (⌘ ⌥ ⇧); worked out from the browser when left out. */
		mac?: boolean;
	}

	let { active = false, open = $bindable(false), mac }: Props = $props();

	const REMEMBERED = 'tables-mindmap-help';
	const apple = $derived(mac ?? (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)));
	const groups = $derived(Object.entries(Object.groupBy(mindMapKeys(apple), (key) => key.group)));

	function remembered(): string | null {
		try { return localStorage.getItem(REMEMBERED); } catch { return null; }
	}

	function show(next: boolean) {
		open = next;
		try { localStorage.setItem(REMEMBERED, next ? 'open' : 'closed'); } catch { /* private window */ }
	}

	// Coming into the mode, the keys are listed until the list has been closed once.
	let was = untrack(() => active);
	$effect(() => {
		if (active && !was && remembered() !== 'closed') open = true;
		if (!active) open = false;
		was = active;
	});

	function onkeydown(event: KeyboardEvent) {
		if (!active || event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
		// A question mark typed into words is a question mark.
		if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
		event.preventDefault();
		show(!open);
	}
</script>

<svelte:window {onkeydown} />

<!-- Mind map mode's keys, listed beside the table. `?` shows and hides it while the mode is on. -->
{#if active && open}
	<section class="mind-help" aria-label="Mind map keys">
		<header>
			<h2>Mind map keys</h2>
			<Button variant="icon" size="sm" icon="close" label="Hide the keys (?)" onclick={() => show(false)} />
		</header>
		{#each groups as [name, keys] (name)}
			<h3>{name}</h3>
			<dl>
				{#each keys ?? [] as key (key.label)}
					<div class="line">
						<dt><Keys keys={key.keys} /></dt>
						<dd>{key.label}</dd>
					</div>
				{/each}
			</dl>
		{/each}
	</section>
{/if}

<style>
	.mind-help {
		width: min(19rem, calc(100vw - 2 * var(--space-4)));
		max-height: min(32rem, 60vh);
		overflow-y: auto;
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		font-size: var(--fs-sm);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	h3 {
		margin: var(--space-2) 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	dl {
		display: grid;
		gap: var(--space-1);
		margin: 0;
	}

	.line {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		align-items: baseline;
		gap: var(--space-2);
	}

	dt,
	dd {
		margin: 0;
	}

	dd {
		color: var(--text-secondary);
	}
</style>
