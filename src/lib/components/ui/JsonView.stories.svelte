<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import JsonView from './JsonView.svelte';

	const found = JSON.stringify({ total: 12, results: [{ url: 'https://caseyagollan.com/2026/11/14/micropub-threads/', title: 'Syndication threads over Micropub', type: 'article', date: '2026-11-14', draft: false, score: 0.82, text: 'A post can carry its social copy as a reply chain, and the endpoint advertises it in q=config.' }, { url: 'https://caseyagollan.com/wiki/indieweb', title: 'IndieWeb', type: 'wiki', date: null }] });

	const { Story } = defineMeta({ title: 'Primitives/JsonView', component: JsonView, args: { text: found }, tags: ['!autodocs'] });
</script>

<!-- Names are bold, strings a little brighter than the punctuation, numbers and true/false/null slanted. -->
<Story name="JSON" />

<!-- Cut short part-way through a string: it still reads. -->
<Story name="Cut short" args={{ text: `${found.slice(0, 180)}…` }} />

<!-- Anything else is shown as it is. -->
<Story name="Plain text" args={{ text: '# Syndication threads over Micropub\nURL: https://caseyagollan.com/2026/11/14/micropub-threads/\n\nA post can carry its social copy as a reply chain.' }} />

<Story name="Long" args={{ text: JSON.stringify({ results: Array.from({ length: 30 }, (_, index) => ({ id: index, title: `Post ${index}`, url: `https://caseyagollan.com/posts/${index}/` })) }) }} />
