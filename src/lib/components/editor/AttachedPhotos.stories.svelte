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
	// On the syndicate page: photos can be left off, up to four go, and alt text fits Mastodon's 1,500 characters.
	let syndicating = $state([{ url: image, alt: 'Casey in front of an ice cream cone sculpture', included: true }, { url: image, alt: '', included: true }, { url: image, alt: 'A second view of the sculpture', included: false }]);
	let overflow = $state(Array.from({ length: 6 }, (_, index) => ({ url: image, alt: `Photo ${index + 1}`, included: index < 4 })));
	let threaded = $state([{ url: image, alt: 'Casey in front of an ice cream cone sculpture', included: true }, { url: image, alt: 'A second view of the sculpture', included: true }]);
	let long = $state([{ url: image, alt: 'A long description of the sculpture. '.repeat(38), included: true }, { url: image, alt: 'An even longer description that runs past the limit. '.repeat(30), included: true }]);
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

<Story asChild name="Syndicating: leave photos off">
	<AttachedPhotos bind:photos={syndicating} name={null} removable max={4} altLimit={1500} />
</Story>

<Story asChild name="Syndicating: more than four photos">
	<AttachedPhotos bind:photos={overflow} name={null} removable max={4} altLimit={1500} />
</Story>

<Story asChild name="Syndicating: alt text near and over the limit">
	<AttachedPhotos bind:photos={long} name={null} removable max={4} altLimit={1500} />
</Story>

<Story asChild name="Syndicating: in the middle of a thread">
	<AttachedPhotos bind:photos={threaded} name={null} removable max={4} altLimit={300} onmove={() => {}} />
</Story>
