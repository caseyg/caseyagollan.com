<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AttachedPhotos from './AttachedPhotos.svelte';

	const { Story } = defineMeta({ title: 'Composer/AttachedPhotos', component: AttachedPhotos, tags: ['!autodocs'] });
</script>

<script lang="ts">
	const image = '/author-avatar.webp';
	let one = $state([{ url: image, alt: '' }]);
	let described = $state([{ url: image, alt: "Casey sitting in front of a giant ice cream cone sculpture with sprinkles." }]);
	let several = $state([{ url: image, alt: 'Casey in front of an ice cream cone sculpture' }, { url: image, alt: '' }, { url: image, alt: '' }]);
</script>

<Story asChild name="One photo without alt text">
	<AttachedPhotos bind:photos={one} />
</Story>

<Story asChild name="Described">
	<AttachedPhotos bind:photos={described} />
</Story>

<Story asChild name="Several photos">
	<AttachedPhotos bind:photos={several} />
</Story>
