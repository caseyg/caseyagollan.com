<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LinkPreviewCard from './LinkPreviewCard.svelte';

	const { Story } = defineMeta({ title: 'Primitives/LinkPreviewCard', component: LinkPreviewCard, parameters: { docs: { story: { height: '440px' } } } });

	// A stand-in screenshot: a page with a heading and lines of text.
	const shot = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#fafafa"/><rect x="40" y="40" width="360" height="28" fill="#222"/><g fill="#bbb">${Array.from({ length: 9 }, (_, i) => `<rect x="40" y="${100 + i * 30}" width="${520 - (i % 3) * 80}" height="12"/>`).join('')}</g></svg>`)}`;
	const href = 'https://cag.wiki/art-under-risk-reading-list';
	const title = 'Art Under Risk Reading List';
	const excerpt = 'Frank, Thomas. “Academy Fight Song.” The Baffler, May 13, 2014. Gall, John. Systemantics: How Systems Work and Especially How They Fail.';
</script>

<!-- A link's page, previewed: its screenshot, address, title and a quoted line. The homepage graph shows it on hover with a mouse, and on the first tap of a link node on a phone; pressing the card opens the page. -->
<Story asChild name="Tap to open">
	<LinkPreviewCard {href} {title} {excerpt} image={{ src: shot }} />
</Story>

<!-- Following a mouse pointer, the card can't be reached, so it has no Open line and lets presses through. -->
<Story asChild name="Hover">
	<LinkPreviewCard {href} {title} {excerpt} image={{ src: shot }} interactive={false} />
</Story>

<Story asChild name="Loading screenshot">
	<LinkPreviewCard {href} {title} image="loading" />
</Story>

<Story asChild name="No screenshot">
	<LinkPreviewCard href="https://www.example.com/a/very/long/path/that/keeps/going/and/going" title="A page whose screenshot failed, with a title long enough to wrap onto a second line and then some" image="error" />
</Story>

<Story asChild name="Text only">
	<LinkPreviewCard href="https://example.com" title="Example Domain" />
</Story>
