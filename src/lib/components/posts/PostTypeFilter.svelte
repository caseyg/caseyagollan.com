<script lang="ts">
	import { goto } from '$app/navigation';
	import { toggleTypes, type PostType, type TypeFilterOption } from '$lib/posts-filter';

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
					<a
						class="pill"
						class:on
						href={href(toggleTypes(option.type, shown, available))}
						title="{on ? 'Remove' : 'Show'} {option.label.toLowerCase()}{on || !filtered ? '' : ' too'}"
						onclick={(event) => onclick(event, option.type)}
					>
						<span class="emoji" aria-hidden="true">{option.icon}</span>
						{option.label}<span class="visually-hidden">{on ? ', selected' : ''}</span>
						<span class="count" aria-label="{option.count} posts">{option.count}</span>
					</a>
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
	.type-filter {
		margin-bottom: var(--space-4);
	}

	/* Clear the fixed corner navigation once it overlaps the reading column. */
	@media (max-width: 1020px) {
		.type-filter {
			margin-top: var(--space-6);
		}
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: fit-content;
		margin: 0 auto;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		letter-spacing: 0.02em;
		list-style: none;
		cursor: pointer;
		user-select: none;
		transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover,
	.type-filter[open] summary {
		background: var(--surface-1);
		color: var(--text-primary);
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
		justify-content: center;
		gap: var(--space-2);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.pill,
	.reset {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-full);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.02em;
		text-decoration: none;
		white-space: nowrap;
		user-select: none;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease), opacity var(--duration) var(--ease);
	}

	/* Unselected: outlined. With nothing selected, every type is shown. */
	.pill {
		border-color: var(--border);
		color: var(--text-secondary);
	}

	.pill:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}

	/* Selected: filled gray. */
	.pill.on {
		border-color: var(--border-strong);
		background: var(--surface-3);
		color: var(--text-primary);
	}

	.pill.on:hover {
		background: var(--surface-2);
	}

	.emoji {
		margin-right: calc(-1 * var(--space-1));
	}

	.count {
		font-variant-numeric: lining-nums tabular-nums;
		opacity: 0.7;
	}

	.reset {
		color: var(--text-primary);
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.reset:hover {
		background: var(--surface-1);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (forced-colors: active) {
		.pill.on {
			border: 2px solid CanvasText;
		}
	}
</style>
