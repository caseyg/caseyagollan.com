<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ThreadComposer from './ThreadComposer.svelte';
	import { characterCount } from '$lib/social-text';
	import { splitIntoThread } from '$lib/social-thread';

	const { Story } = defineMeta({ title: 'Composer/ThreadComposer', component: ThreadComposer, tags: ['!autodocs'] });
	const count = (text: string) => characterCount(text, 'bluesky');
	const fits = (text: string) => count(text) <= 300;
	const link = 'https://caseyagollan.com/2026/11/17/threads/';
	const long = 'Syndicating a long post used to mean cutting it short with an ellipsis and a link. Now the syndicate page can split the full text into a thread instead. Each post stays editable, keeps its own character count, and can be removed or added to.\n\nOn Bluesky and Mastodon the thread goes out as replies to its first post, so it reads as one conversation. Only the first post is linked from the original page, because it stands for the whole thread. If a send fails partway, retrying picks up after the last post that went out, with the text that was reviewed, so nothing is posted twice.';
</script>

<script lang="ts">
	let single = $state(['Notes on threading syndicated posts.\n\n' + link]);
	let thread = $state(splitIntoThread(long, fits, link));
	let tooLong = $state([long]);
	let truncated = $state([long.slice(0, 260) + '…\n\n' + link]);
	let photos = $state(['A short post with a photo.', 'And a reply with two more.']);
</script>

<Story name="Single post">
	<ThreadComposer bind:posts={single} name="bluesky" id="single" limit={300} {count} />
</Story>

<Story name="Thread">
	<ThreadComposer bind:posts={thread} name="bluesky" id="thread" limit={300} {count} />
</Story>

<Story name="Post too long">
	<ThreadComposer bind:posts={tooLong} name="bluesky" id="long" limit={300} {count} counts
		onsplit={() => { tooLong = splitIntoThread(tooLong[0], fits); }} />
</Story>

<Story name="Shortened, can thread the full text">
	<ThreadComposer bind:posts={truncated} name="bluesky" id="truncated" limit={300} {count}
		onsplit={() => { truncated = splitIntoThread(long, fits, link); }} />
</Story>

<Story name="With attachments per post">
	<ThreadComposer bind:posts={photos} name="bluesky" id="photos" limit={300} {count}>
		{#snippet attachments(index)}
			<div class="photos">{#each Array(index ? 2 : 1) as _, i (i)}<span class="photo">Photo {i + 1}</span>{/each}</div>
		{/snippet}
	</ThreadComposer>
</Story>

<style>
	.photos { display: flex; gap: var(--space-2); margin-block: var(--space-2); }
	.photo { display: grid; place-items: center; width: 5rem; aspect-ratio: 1; border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-muted); font-size: var(--fs-xs); }
</style>
