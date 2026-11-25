<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, blueskyRepost, mastodonLike, note, reply } from '$lib/storybook/fixtures';
	import { sourceView } from '$lib/table-post-source';
	import SocialBlock from './SocialBlock.svelte';

	const { Story } = defineMeta({ title: 'Tables/SocialBlock', component: SocialBlock, tags: ['!autodocs'] });
</script>

<!-- A Bluesky repost, as on its post page: the saved post with its link card, marked as reposted. -->
<Story asChild name="Bluesky repost">
	<div class="tile" style="height: 520px"><SocialBlock block={blocks.repost} view={sourceView(blueskyRepost)} /></div>
</Story>

<Story asChild name="Mastodon like">
	<div class="tile" style="height: 200px"><SocialBlock block={blocks.like} view={sourceView(mastodonLike)} /></div>
</Story>

<!-- Casey's own notes read as they do in the feed; a reply sits under the post it answers. -->
<Story asChild name="Note and reply">
	<div class="tiles">
		<div class="tile" style="height: 180px"><SocialBlock block={blocks.note} view={sourceView(note)} /></div>
		<div class="tile" style="height: 300px"><SocialBlock block={blocks.note} view={sourceView(reply)} /></div>
	</div>
</Story>

<!-- A post taken out of a page has only its author, handle, words and picture. -->
<Story asChild name="Taken from a page">
	<div class="tile" style="height: 200px"><SocialBlock block={blocks.socialPost} /></div>
</Story>

<!-- With the table's details hidden: only what was posted, no avatar, name, time or links. -->
<Story asChild name="Details hidden">
	<div class="tiles">
		<div class="tile" style="height: 420px"><SocialBlock block={blocks.repost} view={sourceView(blueskyRepost)} details={false} /></div>
		<div class="tile" style="height: 200px"><SocialBlock block={blocks.note} view={sourceView(reply)} details={false} /></div>
	</div>
</Story>

<!-- A block smaller than its post fades out at the bottom. -->
<Story asChild name="Too small">
	<div class="tile" style="height: 220px"><SocialBlock block={blocks.repost} view={sourceView(blueskyRepost)} /></div>
</Story>

<style>
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.tile {
		width: 360px;
	}
</style>
