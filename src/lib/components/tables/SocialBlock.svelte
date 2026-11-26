<script lang="ts">
	import NoteCard from '../posts/NoteCard.svelte';
	import SavedSocialPost from '../posts/SavedSocialPost.svelte';
	import SocialCard from '../posts/SocialCard.svelte';
	import SocialPost from '../posts/SocialPost.svelte';
	import '../posts/social-card.css';
	import { socialSource } from '$lib/social-card';
	import type { SourceView } from '$lib/table-post-source';
	import type { Block } from '$lib/tables';

	interface Props {
		block: Block;
		/**
		 * The post as the site has it (`fetchSourcePost` + `sourceView`): one of Casey's notes, or the Bluesky or
		 * Mastodon post Casey liked or reposted. Without one, a social post taken out of a page is drawn from the block.
		 */
		view?: SourceView;
		/** Shows who posted it, when, and the 🦋/🐘 links out. Off (the table's Details toggle), only the post's content. */
		details?: boolean;
	}

	let { block, view = null, details = true }: Props = $props();

	const piece = $derived({ name: block.title, handle: block.meta ?? '', url: block.url });
</script>

<!-- A table block drawn as the post reads where it came from, with the same cards as the post pages. Inert: the canvas
     selects, drags and opens the block, so its links don't. -->
<div class="social-block" inert>
	{#if view?.type === 'note'}
		<NoteCard post={view.post} fill byline={details} />
	{:else if view?.type === 'saved'}
		<SocialCard fill><SavedSocialPost snapshot={view.snapshot} marks={[view.mark]} byline={details} /></SocialCard>
	{:else}
		<SocialCard fill>
			<SocialPost author={piece} url={block.url} sources={[socialSource(block.url)]} byline={details}>
				<div class="social-card-scope social-post-content">
					{#if block.excerpt}<p>{block.excerpt}</p>{/if}
					{#if block.image}<img class="social-attachment" src={block.image} alt="" loading="lazy" draggable="false" />{/if}
				</div>
			</SocialPost>
		</SocialCard>
	{/if}
</div>

<style>
	.social-block {
		width: 100%;
		height: 100%;
		color: var(--text-primary);
		font-family: var(--font-sans);
		text-align: left;
	}
</style>
