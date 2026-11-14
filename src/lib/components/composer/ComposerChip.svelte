<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Form field name; checked chips submit `value`. */
		name?: string;
		value: string;
		/** Selected values, for a set of chips; otherwise `checked`. */
		group?: string[];
		checked?: boolean;
		/** Tooltip, such as "Also post to Bluesky". */
		title?: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { name, value, group = $bindable(), checked = $bindable(false), title, disabled = false, children }: Props = $props();
	const on = $derived(group ? group.includes(value) : checked);
	function change(event: Event & { currentTarget: HTMLInputElement }) {
		const next = event.currentTarget.checked;
		if (group) group = next ? [...group.filter(item => item !== value), value] : group.filter(item => item !== value);
		else checked = next;
	}
</script>

<!-- A toggle pill for choosing destinations, shared by /new and the syndicate page. -->
<label class="composer-chip" {title}>
	<input type="checkbox" {name} {value} checked={on} {disabled} onchange={change} />
	<span>{@render children()}</span>
</label>

<style>
	.composer-chip { position: relative; display: inline-flex; cursor: pointer; }
	input { position: absolute; opacity: 0; pointer-events: none; }
	span { display: inline-block; padding: 0.15rem var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-full); color: var(--text-secondary); font-size: var(--fs-xs); line-height: var(--lh-snug); white-space: nowrap; transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease); }
	@media (hover: hover) { .composer-chip:hover span { border-color: var(--border-strong); color: var(--text-primary); } }
	input:checked + span { border-color: var(--text-primary); background: var(--text-primary); color: var(--bg-primary); }
	input:focus-visible + span { outline: 2px solid var(--text-primary); outline-offset: 2px; }
	input:disabled + span { opacity: 0.5; cursor: default; }
</style>
