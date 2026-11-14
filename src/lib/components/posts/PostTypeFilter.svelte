<script lang="ts">
	import { toggleHref, typesHref, type PostType, type TypeFilterOption } from '$lib/posts-filter';

	interface Props {
		options: TypeFilterOption[];
		/** Types currently shown; every option when the feed is unfiltered. */
		selected: PostType[];
	}

	let { options, selected }: Props = $props();

	const available = $derived(options.map((option) => option.type));
	const shown = $derived(new Set(selected));
	const filtered = $derived(shown.size < available.length);
</script>

{#if options.length > 1}
	<nav class="type-filter" aria-label="Filter posts by type">
		<ul>
			{#each options as option (option.type)}
				{@const on = shown.has(option.type)}
				<li>
					<a
						class="pill"
						class:on
						href={toggleHref(option.type, shown, available)}
						title="{on ? 'Hide' : 'Show'} {option.label.toLowerCase()}"
						data-sveltekit-noscroll
						data-sveltekit-keepfocus
					>
						<span class="mark" aria-hidden="true">{on ? '✓' : '+'}</span>
						{option.label}<span class="visually-hidden">, {on ? 'shown' : 'hidden'}</span>
						<span class="count" aria-label="{option.count} posts">{option.count}</span>
					</a>
				</li>
			{/each}
			{#if filtered}
				<li>
					<a class="reset" href={typesHref(available, available)} data-sveltekit-noscroll>Show all</a>
				</li>
			{/if}
		</ul>
	</nav>
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

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pill,
	.reset {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: var(--lh-normal);
		letter-spacing: 0.02em;
		text-decoration: none;
		white-space: nowrap;
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	.pill {
		color: var(--text-muted);
	}

	.pill:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.pill.on {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--text-primary);
	}

	.pill.on:hover {
		border-color: var(--accent-hover);
		background: var(--accent-hover);
	}

	.mark {
		width: 1ch;
		text-align: center;
	}

	.count {
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
	}

	.reset {
		border-color: transparent;
		color: var(--text-primary);
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.reset:hover {
		background: var(--surface-2);
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
			border-width: 2px;
		}
	}
</style>
