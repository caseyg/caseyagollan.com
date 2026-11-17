<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FrontmatterProperties from './FrontmatterProperties.svelte';

	const { Story } = defineMeta({ title: 'Composer/FrontmatterProperties', component: FrontmatterProperties, tags: ['!autodocs'] });
</script>

<script lang="ts">
	let note = $state<Record<string, string[]>>({
		category: ['indieweb', 'social'],
		syndication: ['https://bsky.app/profile/caseyagollan.com/post/3n2cde25cgc2m'],
		'pesos-source': ['at://did:plc:s3fw2giksymfvruno3tvem4k/app.bsky.feed.post/3n2cde25cgc2m']
	});
	let reply = $state<Record<string, string[]>>({ 'in-reply-to': ['https://example.com/a-post/'], summary: ['A short summary'] });
	let empty = $state<Record<string, string[]>>({});
	let status = $state<'published' | 'draft'>('published');
	let article = $state<Record<string, string[]>>({ category: ['writing'] });
	let slug = $state('writing-again-7e155168');
	let renamed = $state('writing-again');
	let invalid = $state('writing again?');
</script>

<Story asChild name="Imported note">
	<FrontmatterProperties bind:properties={note} bind:status published="2026-11-14T15:24:13-05:00"
		readOnly={[{ key: 'photo', values: [{ value: 'https://files.caseyagollan.com/example.jpg', alt: 'A photo' }] }, { key: 'draft', values: [false] }]} />
</Story>

<Story asChild name="Reply">
	<FrontmatterProperties bind:properties={reply} bind:status published="2026-11-06T20:00:00-05:00" updated="2026-11-07T09:12:00-05:00" />
</Story>

<Story asChild name="Empty">
	<FrontmatterProperties bind:properties={empty} status="draft" />
</Story>

<Story asChild name="Slug">
	<FrontmatterProperties bind:properties={article} bind:status bind:slug savedSlug="writing-again-7e155168" address="/2026/11/14/" suggestedSlug="Writing again" published="2026-11-14T10:00:00-05:00" />
</Story>

<Story asChild name="Slug changed">
	<FrontmatterProperties bind:properties={article} bind:status bind:slug={renamed} savedSlug="writing-again-7e155168" address="/2026/11/14/" published="2026-11-14T10:00:00-05:00" />
</Story>

<Story asChild name="Slug invalid">
	<FrontmatterProperties bind:properties={article} bind:status bind:slug={invalid} savedSlug="writing-again-7e155168" address="/2026/11/14/" published="2026-11-14T10:00:00-05:00" />
</Story>
