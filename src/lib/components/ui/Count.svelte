<script lang="ts">
	let { value, label }: { value: number | string; label?: string } = $props();
</script>

<span class="count" aria-label={label}>{value}</span>

<style>
	.count {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-full);
		background: var(--surface-3);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-snug);
		letter-spacing: 0.01em;
	}
</style>
