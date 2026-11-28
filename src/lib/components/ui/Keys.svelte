<script lang="ts">
	interface Props {
		/** The keys to press together, each as it is printed on the key: `['⌘', 'Enter']`. */
		keys: string[];
	}

	let { keys }: Props = $props();
</script>

<!-- Keys to press together, each drawn as a key cap. -->
<kbd class="keys">{#each keys as key, index (index)}<kbd class="key">{key}</kbd>{/each}</kbd>

<style>
	.keys {
		display: inline-flex;
		gap: 3px;
		font: inherit;
		white-space: nowrap;
	}

	.key {
		min-width: 1.5em;
		padding: 0.1em 0.4em;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--fs-xs);
		line-height: 1.4;
		text-align: center;
	}
</style>
