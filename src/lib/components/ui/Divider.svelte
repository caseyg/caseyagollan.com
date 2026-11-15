<script lang="ts">
	/** A section break drawn as three centered dots, the same mark Prose gives a Markdown `---`. Used between posts in a feed. */
	let { class: className = '' }: { class?: string } = $props();
</script>

<hr class="divider {className}" />

<style>
	.divider {
		margin: var(--space-6) 0;
		border: 0;
		overflow: visible;
		height: auto;
		color: var(--border);
		text-align: center;
		line-height: 1;
	}

	/* Keep in step with `.prose hr` in Prose.svelte. */
	.divider::after {
		content: '\2022\2022\2022';
		letter-spacing: 0.75em;
		/* Letter spacing trails the last dot, so pull it back to stay centered. */
		margin-right: -0.75em;
	}
</style>
