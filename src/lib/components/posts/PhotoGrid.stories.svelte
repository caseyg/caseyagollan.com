<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PhotoGrid from './PhotoGrid.svelte';
	import PostsLayout from './PostsLayout.svelte';
	import ArchiveHeader from './ArchiveHeader.svelte';
	import { photo } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Posts/PhotoGrid', component: PhotoGrid, parameters: { layout: 'fullscreen' } });

	const urls = ['/sisu.gif', '/author-avatar.webp'];
	const photos = Array.from({ length: 14 }, (_, index) => ({
		...photo,
		slug: `photo-${index + 1}`,
		date: `2026-01-${String(28 - index).padStart(2, '0')}T12:00:00-05:00`,
		photo: index % 5 === 2 ? [{ url: urls[index % 2] }, { url: urls[(index + 1) % 2] }] : [{ url: urls[index % 2], alt: `Photo ${index + 1}` }]
	}));
</script>

<!-- The photos archive: a full-width page with the usual trail above the waterfall. -->
<Story asChild name="PhotosArchive">
	<PostsLayout width="full">
		<ArchiveHeader title="Photos" icon="📷" count={photos.length} />
		<PhotoGrid posts={photos} />
	</PostsLayout>
</Story>

<Story asChild name="Phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	<PostsLayout width="full">
		<ArchiveHeader title="Photos" icon="📷" count={photos.length} />
		<PhotoGrid posts={photos} />
	</PostsLayout>
</Story>

<Story asChild name="Empty">
	<PostsLayout width="full">
		<ArchiveHeader title="Photos" icon="📷" count={0} />
		<PhotoGrid posts={[]} />
	</PostsLayout>
</Story>
