<script lang="ts">
	import EditableFigure from './EditableFigure.svelte';

	interface Photo { url: string; alt: string }
	interface Props {
		/** The post's attached photos. Bound: editing alt text changes them. */
		photos: Photo[];
		/** Hidden field that carries the alt text, one per photo, as JSON. */
		name?: string;
	}

	let { photos = $bindable(), name = 'photo-alts' }: Props = $props();

	const json = $derived(JSON.stringify(photos.map(photo => photo.alt)));
	const missing = $derived(photos.filter(photo => !photo.alt.trim()).length);
</script>

{#if photos.length}
	<section class="attached-photos" class:grid={photos.length > 1} aria-label="Photos">
		<input type="hidden" {name} value={json} />
		{#each photos as photo, index (index)}
			<EditableFigure variant="photo" figure={{ src: photo.url, alt: photo.alt, caption: '', align: 'full' }} onchange={changes => { if (changes.alt !== undefined) photos[index].alt = changes.alt; }} />
		{/each}
		{#if missing}<p class="hint">{photos.length === 1 ? 'This photo has' : missing === 1 ? 'One photo has' : `${missing} photos have`} no alt text yet. Describe {missing === 1 ? 'it' : 'them'} for people who can't see {missing === 1 ? 'it' : 'them'}.</p>{/if}
	</section>
{/if}

<style>
	.attached-photos {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: var(--space-2) 0;
	}

	.attached-photos.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
		align-items: start;
	}

	/* In a grid, photos fill their column, as thumbnails do. */
	.grid :global(.photo-image) {
		width: 100%;
	}

	.hint {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-normal);
	}
</style>
