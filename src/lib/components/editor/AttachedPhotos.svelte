<script lang="ts">
	import EditableFigure from './EditableFigure.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { altLength } from '$lib/social-text';

	interface Photo {
		url: string;
		alt: string;
		/** With `removable`: whether the photo goes with the post. Undefined counts as included. */
		included?: boolean;
	}
	interface Props {
		/** The post's attached photos. Bound: editing alt text, or leaving a photo off, changes them. */
		photos: Photo[];
		/** Hidden field that carries the alt text, one per photo, as JSON. Null leaves the field out. */
		name?: string | null;
		/** Lets each photo be left off, as when sending the post to a network. */
		removable?: boolean;
		/** With `removable`: the most photos that can go at once. The rest wait, left off. */
		max?: number;
		/** The longest alt text allowed. Its count shows as the text gets close. */
		altLimit?: number;
	}

	let { photos = $bindable(), name = 'photo-alts', removable = false, max = Infinity, altLimit }: Props = $props();

	const json = $derived(JSON.stringify(photos.map(photo => photo.alt)));
	const included = (photo: Photo) => !removable || photo.included !== false;
	const sending = $derived(photos.filter(included));
	const missing = $derived(sending.filter(photo => !photo.alt.trim()).length);
	const full = $derived(sending.length >= max);
	const left = $derived(photos.length - sending.length);
</script>

{#if photos.length}
	<section class="attached-photos" class:grid={photos.length > 1} aria-label="Photos">
		{#if name}<input type="hidden" {name} value={json} />{/if}
		{#each photos as photo, index (index)}
			{@const count = altLength(photo.alt)}
			<div class="photo" class:left-off={!included(photo)}>
				<EditableFigure variant="photo" figure={{ src: photo.url, alt: photo.alt, caption: '', align: 'full' }} onchange={changes => { if (changes.alt !== undefined) photos[index].alt = changes.alt; }} />
				{#if removable || (altLimit && count > altLimit * 0.8)}
					<div class="meta">
						{#if altLimit && count > altLimit * 0.8}<span class="count" class:over={count > altLimit}>{count}/{altLimit}</span>{/if}
						{#if removable}
							{#if included(photo)}
								<Button size="sm" variant="quiet" icon="close" onclick={() => (photos[index].included = false)}>Leave off</Button>
							{:else}
								<Button size="sm" variant="quiet" icon="plus" disabled={full} title={full ? `Up to ${max} photos` : undefined} onclick={() => (photos[index].included = true)}>Add back</Button>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if missing || (removable && left)}
			<p class="hint">
				{#if missing}{sending.length === 1 ? 'This photo has' : missing === 1 ? 'One photo has' : `${missing} photos have`} no alt text yet. Describe {missing === 1 ? 'it' : 'them'} for people who can't see {missing === 1 ? 'it' : 'them'}.{/if}
				{#if removable && left}{left === 1 ? 'One photo is' : `${left} photos are`} left off{photos.length > max ? `; up to ${max} can go` : ''}.{/if}
			</p>
		{/if}
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

	.photo {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	/* A photo left off stays in view, faded, so it can be added back. */
	.left-off :global(.photo-image) {
		opacity: 0.4;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.count {
		margin-right: auto;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
	}

	.count.over {
		color: var(--text-primary);
		text-decoration: underline wavy;
		font-weight: var(--fw-semibold);
	}

	.hint {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: var(--lh-normal);
	}
</style>
