<script lang="ts">
	interface Option {
		value: string;
		label: string;
		href: string;
		count?: number;
		icon?: string;
	}

	interface Props {
		current: string;
		currentIcon?: string;
		options: Option[];
		countDescription?: string;
		backLink?: string;
		backText?: string;
	}

	let { current, currentIcon, options, countDescription, backLink = '/posts/', backText = 'All Posts' }: Props = $props();

	let isOpen = $state(false);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.dropdown-container')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="header">
	<a href={backLink} class="back-link">{backText}</a>

	<div class="dropdown-container">
		<button
			class="dropdown-trigger"
			onclick={() => isOpen = !isOpen}
			aria-expanded={isOpen}
			aria-haspopup="listbox"
		>
			<span class="current-value">{#if currentIcon}<span class="current-icon">{currentIcon}</span>{/if}{current}</span>
			<span class="dropdown-arrow" class:open={isOpen}>▾</span>
		</button>

		{#if isOpen}
			<div class="dropdown-menu" role="listbox">
				{#each options as option (option.value)}
					<a
						href={option.href}
						class="dropdown-item"
						class:active={option.label === current}
						role="option"
						aria-selected={option.label === current}
					>
						<span class="option-label">{#if option.icon}<span class="option-icon">{option.icon}</span>{/if}{option.label}</span>
						{#if option.count !== undefined}
							<span class="option-count">{option.count}</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	{#if countDescription}
		<p class="count-description">{countDescription}</p>
	{/if}
</div>

<style>
	.header {
		margin-bottom: 3rem;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 0.875rem;
		display: inline-block;
		margin-bottom: 0.5rem;
		margin-left: -0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.back-link:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.back-link::before {
		content: '← ';
	}

	.dropdown-container {
		position: relative;
	}

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: #0000ff;
		border: none;
		border-radius: 4px;
		padding: 0.5rem 1rem;
		color: #fff;
		font-size: 1.25rem;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.dropdown-trigger:hover {
		background: #4949ff;
	}

	.dropdown-arrow {
		font-size: 0.875rem;
		transition: transform 0.15s ease;
	}

	.dropdown-arrow.open {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		min-width: 180px;
		max-height: 300px;
		overflow-y: auto;
		background: #0000ff;
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
	}

	.dropdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		color: #fff;
		text-decoration: none;
		font-size: 1rem;
		transition: background 0.15s ease;
	}

	.dropdown-item:hover {
		background: #4949ff;
	}

	.dropdown-item.active {
		background: #4949ff;
	}

	.current-icon,
	.option-icon {
		margin-right: 0.5rem;
	}

	.option-count {
		background: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
		margin-left: 0.5rem;
		font-variant-numeric: tabular-nums;
	}

	.count-description {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}
</style>
