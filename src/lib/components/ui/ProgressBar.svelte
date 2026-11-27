<script lang="ts">
	interface Props {
		/** How far along, from 0 to 1. Leave out while the length of the work isn't known: the bar then moves on its own. */
		value?: number;
		/** What is under way, for screen readers. */
		label: string;
		/** Paler, for work that is paused or waiting. */
		waiting?: boolean;
		[key: string]: unknown;
	}

	let { value, label, waiting = false, ...rest }: Props = $props();
	const known = $derived(typeof value === 'number' && Number.isFinite(value));
	const percent = $derived(known ? Math.round(Math.min(Math.max(value!, 0), 1) * 100) : undefined);
</script>

<span class="progress" class:waiting class:unknown={!known} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} {...rest}>
	<span class="fill" style:inline-size={known ? `${percent}%` : undefined}></span>
</span>

<style>
	.progress {
		display: block;
		block-size: 4px;
		inline-size: 100%;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}

	.fill {
		display: block;
		block-size: 100%;
		min-inline-size: 4px;
		border-radius: inherit;
		background: var(--text-secondary);
		transition: inline-size 600ms ease;
	}

	.waiting .fill {
		opacity: 0.45;
	}

	.unknown .fill {
		inline-size: 30%;
		animation: slide 1.4s ease-in-out infinite alternate;
	}

	@keyframes slide {
		from { translate: 0 0; }
		to { translate: 233% 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.fill { transition: none; }
		.unknown .fill { animation: none; inline-size: 100%; opacity: 0.35; }
	}
</style>
