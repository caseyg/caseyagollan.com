<script lang="ts">
	import { goto } from '$app/navigation';
	import { toggleTypes, type PostType, type TypeFilterOption } from '$lib/posts-filter';
	import { ToggleChip } from '$lib/components/ui';

	interface Props {
		options: TypeFilterOption[];
		/** Types currently shown; every option when nothing is filtered. */
		selected: PostType[];
		/** The URL for a selection of types, e.g. the main feed's filter route or this page with `?types=`. */
		href: (types: PostType[]) => string;
	}

	let { options, selected, href }: Props = $props();

	const available = $derived(options.map((option) => option.type));
	const shown = $derived(new Set(selected));
	const filtered = $derived(shown.size < available.length);
	const shownCount = $derived(available.filter((type) => shown.has(type)).length);

	// Collapsed until asked for, but open whenever a filter is active so it can be undone.
	// svelte-ignore state_referenced_locally
	let open = $state(selected.length < options.length);
	$effect(() => {
		if (filtered) open = true;
	});

	// Without JavaScript each pill is a plain link; with it, keep the scroll position and focus.
	function onclick(event: MouseEvent, type: PostType) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		goto(href(toggleTypes(type, shown, available)), { noScroll: true, keepFocus: true });
	}
</script>

{#if options.length > 1}
	<details class="type-filter" bind:open>
		<summary>
			<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6z" />
			</svg>
			<span>Filter</span>
			{#if filtered}<span class="status">{shownCount} selected</span>{/if}
		</summary>
		<ul aria-label="Post types">
			{#each options as option (option.type)}
				{@const on = filtered && shown.has(option.type)}
				<li>
					<ToggleChip
						pressed={on}
						href={href(toggleTypes(option.type, shown, available))}
						title="{on ? 'Remove' : 'Show'} {option.label.toLowerCase()}{on || !filtered ? '' : ' too'}"
						onclick={(event) => onclick(event, option.type)}
					>
						<span class="emoji" aria-hidden="true">{option.icon}</span>
						{option.label}
						<span class="count" aria-label="{option.count} posts">{option.count}</span>
					</ToggleChip>
				</li>
			{/each}
			{#if filtered}
				<li>
					<a class="reset" href={href([...available])} data-sveltekit-noscroll data-sveltekit-keepfocus>Clear</a>
				</li>
			{/if}
		</ul>
	</details>
{/if}

<style>
	/* Sits in a page header's row: the toggle at the end of the trail's line, the pills beneath both. */
	summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: fit-content;
		margin-left: auto;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.01em;
		list-style: none;
		cursor: pointer;
		user-select: none;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.type-filter[open] summary {
		background: var(--surface-1);
		color: var(--text-primary);
	}

	@media (hover: hover) and (pointer: fine) {
		summary:hover {
			background: var(--surface-1);
			color: var(--text-primary);
		}
	}

	.icon {
		width: 1em;
		height: 1em;
		fill: currentColor;
	}

	.status {
		color: var(--text-muted);
		font-variant-numeric: lining-nums tabular-nums;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.reset {
		display: inline-flex;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		color: var(--text-primary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.02em;
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
		transition: background var(--duration) var(--ease);
	}

	.reset:hover {
		background: var(--surface-1);
	}

	.emoji {
		margin-right: calc(-1 * var(--space-1));
	}

	.count {
		font-variant-numeric: lining-nums tabular-nums;
		opacity: 0.7;
	}
</style>
