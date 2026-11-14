<script lang="ts">
	import { goto } from '$app/navigation';
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

	/** Two clicks on one pill within this window solo that type. */
	const DOUBLE_CLICK_MS = 400;
	let lastClick: { type: PostType; at: number } | undefined;

	/** Show only this type, or everything again when it is already the only one shown. */
	function soloHref(type: PostType): string {
		const solo = shown.size === 1 && shown.has(type);
		return typesHref(solo ? available : [type], available);
	}

	// Without JavaScript the pill is a plain toggle link. With it, the first click toggles
	// at once and a quick second click on the same pill replaces that with a solo view.
	function onclick(event: MouseEvent, type: PostType) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		const now = event.timeStamp;
		const double = lastClick?.type === type && now - lastClick.at < DOUBLE_CLICK_MS;
		lastClick = double ? undefined : { type, at: now };
		goto(double ? soloHref(type) : toggleHref(type, shown, available), { noScroll: true, keepFocus: true });
	}
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
						title="{on ? 'Hide' : 'Show'} {option.label.toLowerCase()} (double-click to show only {option.label.toLowerCase()})"
						onclick={(event) => onclick(event, option.type)}
					>
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
		justify-content: center;
		gap: var(--space-2);
		margin: 0;
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
		transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease);
	}

	/* Hidden types: outlined and quiet. */
	.pill {
		border-color: var(--border);
		color: var(--text-muted);
	}

	.pill:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}

	/* Shown types: filled gray. */
	.pill.on {
		border-color: transparent;
		background: var(--surface-3);
		color: var(--text-primary);
	}

	.pill.on:hover {
		background: var(--surface-2);
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
