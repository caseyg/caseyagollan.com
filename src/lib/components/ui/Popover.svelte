<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Content of the trigger button. */
		trigger: Snippet<[open: boolean]>;
		/** Panel content: links, a menu list, or a short form. */
		children: Snippet;
		/** Accessible name for the trigger when its content is only an icon or a count. */
		label?: string;
		/** Which edge of the trigger the panel lines up with. */
		align?: 'start' | 'end';
		open?: boolean;
		/** Classes on the wrapper, trigger and panel, for the caller's styles (use `:global`). */
		class?: string;
		triggerClass?: string;
		panelClass?: string;
		title?: string;
	}

	let { trigger, children, label, align = 'start', open = $bindable(false), class: className = '', triggerClass = '', panelClass = '', title }: Props = $props();

	const panelId = $props.id();
	let container: HTMLElement | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();

	// Every popover closes on an outside click, on Escape, and when one of its links is followed.
	function onWindowClick(event: MouseEvent) {
		if (open && container && !container.contains(event.target as Node)) open = false;
	}
	function onWindowKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') { open = false; button?.focus(); }
	}
	function onPanelClick(event: MouseEvent) {
		if ((event.target as Element).closest('a[href]')) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="popover {className}" bind:this={container}>
	<button bind:this={button} type="button" class="popover-trigger {triggerClass}" aria-expanded={open} aria-controls={panelId} aria-label={label} {title} onclick={() => { open = !open; }}>
		{@render trigger(open)}
	</button>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div id={panelId} class="popover-panel {panelClass}" class:end={align === 'end'} hidden={!open} onclick={onPanelClick}>
		{@render children()}
	</div>
</div>

<style>
	.popover { position: relative; width: fit-content; }
	.popover-trigger { font: inherit; cursor: pointer; }
	.popover-panel {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: var(--z-menu);
		overflow: auto;
		max-height: 70vh;
	}
	.popover-panel.end { left: auto; right: 0; }
	.popover-panel[hidden] { display: none; }
</style>
