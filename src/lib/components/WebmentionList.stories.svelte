<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WebmentionList from './WebmentionList.svelte';
	import { backfeedThread, longWebmentionReply, webmentions } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Site/Webmentions', component: WebmentionList, parameters: { docs: { story: { height: '640px' } } } });
</script>

<script lang="ts">
	import { applyModeration, emptyModeration, isHidden, type MentionModeration, type ModerationAction } from '$lib/webmentions';

	// The owner stories keep their own moderation, as a post page does in a preview.
	let moderation: MentionModeration = $state({ hidden: [3], blockedAuthors: [] });
	const owned = $derived(webmentions.map((mention) => ({ ...mention, hidden: isHidden(mention, moderation) })));
	const moderate = (change: ModerationAction) => {
		moderation = applyModeration(moderation, change);
	};
	const failing = async () => {
		await new Promise((resolve) => setTimeout(resolve, 400));
		throw new Error('That change wasn’t saved. Try again.');
	};
</script>

<Story name="Visitor" args={{ mentions: webmentions }} />

<Story name="Likes only" args={{ mentions: webmentions.filter((mention) => mention.kind === 'like') }} />

<!-- Read from Bluesky and Mastodon directly: each reply sits under the one it answers. -->
<Story name="Bluesky thread" args={{ mentions: backfeedThread }} />

<Story name="Bluesky thread with Webmentions" args={{ mentions: [...webmentions, ...backfeedThread] }} />

<Story name="Long reply" args={{ mentions: [longWebmentionReply] }} />

<Story name="Loading" args={{ mentions: [], loading: true }} />

<!-- Nothing renders for a post nobody has mentioned. -->
<Story name="None" args={{ mentions: [] }} />

<!-- Signed in: the list looks as visitors see it until Moderate is pressed. -->
<Story name="Owner">
	{#snippet template()}
		<WebmentionList mentions={owned} mode="owner" {moderation} onModerate={moderate} />
	{/snippet}
</Story>

<!-- Moderating: hidden mentions show dimmed, and each one has a menu. -->
<Story name="Owner moderating">
	{#snippet template()}
		<WebmentionList mentions={owned} mode="owner" {moderation} moderating onModerate={moderate} />
	{/snippet}
</Story>

<Story name="Save fails">
	{#snippet template()}
		<WebmentionList mentions={webmentions} mode="owner" moderation={emptyModeration()} moderating onModerate={failing} />
	{/snippet}
</Story>

<Story name="Preview demo">
	{#snippet template()}
		<WebmentionList mentions={owned} mode="demo" {moderation} moderating onModerate={moderate} />
	{/snippet}
</Story>
