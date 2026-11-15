<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse } from 'msw';
	import WikiPreviews from './WikiPreviews.svelte';
	import { Prose } from '$lib/components/ui';
	import { samplePreviews } from '$lib/storybook/wiki';

	const { Story } = defineMeta({
		title: 'Wiki/WikiPreviews',
		component: WikiPreviews,
		parameters: {
			docs: { story: { height: '420px' } },
			msw: {
				handlers: [
					http.get('*/wiki/:slug/preview.json', ({ params }) => {
						const preview = samplePreviews[String(params.slug)];
						return preview ? HttpResponse.json(preview) : new HttpResponse(null, { status: 404 });
					})
				]
			}
		}
	});
</script>

<!-- Mounted once for the whole site: resting on a link to a wiki page, in any prose, opens a preview of it. -->
<Story asChild name="Default">
	<Prose>
		<p>
			Hover <a href="/wiki/art-under-risk">Art Under Risk</a> or <a href="/wiki/organizing">Organizing</a> to preview the page. Links elsewhere,
			like <a href="/posts/">Posts</a>, and pages that aren't in the wiki, like <a href="/wiki/unpublished">this one</a>, get no card.
		</p>
	</Prose>
	<WikiPreviews delay={200} />
</Story>
