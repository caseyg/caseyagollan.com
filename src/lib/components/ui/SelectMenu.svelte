<script module lang="ts">
	export interface MenuOption {
		value: string;
		label: string;
		href: string;
		count?: number;
		icon?: string;
	}
</script>

<script lang="ts">
	import Count from './Count.svelte';

	interface Props {
		/** Label of the selected option, shown on the trigger. */
		current: string;
		currentIcon?: string;
		count?: number;
		options: MenuOption[];
	}

	let { current, currentIcon, count, options }: Props = $props();

	const menuId = $props.id();
	let isOpen = $state(false);
	let container: HTMLElement | undefined = $state();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (container && !container.contains(event.target as Node)) isOpen = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="select-menu" bind:this={container}>
	<button
		type="button"
		class="trigger"
		onclick={() => (isOpen = !isOpen)}
		aria-expanded={isOpen}
		aria-controls={menuId}
	>
		<span class="current">{#if currentIcon}<span class="icon" aria-hidden="true">{currentIcon}</span>{/if}{current}</span>
		{#if count !== undefined}<Count value={count} label="{count} posts" />{/if}
		<span class="arrow" class:open={isOpen} aria-hidden="true">▾</span>
	</button>

	{#if isOpen}
		<ul class="menu" id={menuId}>
			{#each options as option (option.value)}
				<li>
					<a
						href={option.href}
						class="item"
						class:active={option.label === current}
						aria-current={option.label === current ? 'page' : undefined}
					>
						<span>{#if option.icon}<span class="icon" aria-hidden="true">{option.icon}</span>{/if}{option.label}</span>
						{#if option.count !== undefined}<Count value={option.count} />{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.select-menu {
		position: relative;
		width: fit-content;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	.trigger:hover,
	.trigger[aria-expanded='true'] {
		background: var(--accent-hover);
	}

	.arrow {
		font-size: var(--fs-sm);
		transition: transform var(--duration) var(--ease);
	}

	.arrow.open {
		transform: rotate(180deg);
	}

	.icon {
		margin-right: var(--space-2);
	}

	.menu {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: var(--z-menu);
		min-width: 12rem;
		max-height: 19rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
		border-radius: var(--radius-sm);
		background: var(--accent);
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
		scrollbar-width: thin;
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		color: var(--text-primary);
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
		text-decoration: none;
		transition: background var(--duration) var(--ease);
	}

	.item:hover,
	.item.active {
		background: var(--accent-hover);
	}

	.item:focus-visible {
		outline-offset: -2px;
	}
</style>
