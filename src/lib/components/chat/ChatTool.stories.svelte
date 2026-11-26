<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatTool from './ChatTool.svelte';

	const { Story } = defineMeta({
		title: 'Chat/ChatTool',
		component: ChatTool,
		args: { open: false, step: { tool: 'search_site', label: 'Searched the site for “cooperatives”', status: 'done', request: [{ name: 'Query', value: 'cooperatives' }, { name: 'Limit', value: '8' }], response: JSON.stringify({ total: 2, results: [{ url: 'https://caseyagollan.com/library/', title: 'Library', type: 'page' }, { url: 'https://caseyagollan.com/wiki/cooperatives', title: 'Cooperatives', type: 'wiki', text: 'Notes on worker- and user-owned organisations.' }] }), links: [{ url: '/library/', title: 'Library' }, { url: '/wiki/cooperatives', title: 'Cooperatives' }] } }
	});
</script>

<!-- A gray line, the words it was about brighter. It opens to what it found, what it was asked and what came back. -->
<Story name="Search, closed" />

<Story name="Search, open" args={{ open: true }} />

<!-- The only step in its stretch of a reply stands as a line by itself. -->
<Story name="Alone in a reply" args={{ variant: 'line' }} />

<Story name="Failed with a reason" args={{ open: true, step: { tool: 'fetch_page', label: 'Read example.com/private', status: 'failed', request: [{ name: 'Url', value: 'https://example.com/private' }], error: 'example.com answered 403.' } }} />

<!-- A long address and long values wrap inside a narrow chat. -->
<Story name="Open on a phone" args={{ open: true, step: { tool: 'fetch_page', label: 'Read caseyagollan.com/2026/11/14/micropub-threads/', status: 'done', request: [{ name: 'Url', value: 'https://caseyagollan.com/2026/11/14/micropub-threads/?utm_source=a-very-long-query-string-that-never-breaks' }], response: '# Syndication threads over Micropub\nURL: https://caseyagollan.com/2026/11/14/micropub-threads/\n\nA post can carry its social copy as a reply chain.' } }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />

<Story name="Running" args={{ step: { tool: 'fetch_page', label: 'Read indieweb.org/Micropub', status: 'running' } }} />

<Story name="Failed" args={{ step: { tool: 'fetch_page', label: 'Read example.com/private', status: 'failed' } }} />

<Story name="Micropub" args={{ step: { tool: 'micropub_update_post', label: 'Updated a post', status: 'done' } }} />

<!-- `show_page`: here only the line; `ChatSteps` puts the page's card under the steps, always in view. -->
<Story name="Page shown" args={{ step: { tool: 'show_page', label: 'Showed Syndication threads over Micropub', status: 'done', peek: { url: 'https://caseyagollan.com/2026/11/14/micropub-threads/', title: 'Syndication threads over Micropub', excerpt: 'A post can carry its social copy as a reply chain, and the endpoint advertises it in q=config.' } } }} />

<!-- `table_look`: the snapshot the assistant checked its layout against, items numbered, overlaps in red. Opens on demand. -->
<Story name="Table snapshot" args={{ open: true, step: { tool: 'table_look', label: 'Looked at the table', status: 'done', picture: { src: 'table-look.jpg', alt: 'What the assistant saw of the table, each item numbered' } } }} />

<Story name="Table change" args={{ step: { tool: 'table_arrange', label: 'Arranged the table in a grid', status: 'done' } }} />

<!-- `table_add`: one step puts a whole part of the table down, whatever it is made of. -->
<Story name="Table add" args={{ step: { tool: 'table_add', label: 'Added 6 notes, 1 link and results for “oliveros”', status: 'done' } }} />

<!-- `search_site` without words lists by date. -->
<Story name="Browsed by date" args={{ step: { tool: 'search_site', label: 'Looked through posts from the last 7 days', status: 'done', links: [{ url: '/2026/11/24/3mynekhkgwk2u/', title: 'Commission on Federal Paperwork, 1976–1977' }] } }} />

<Story name="Took you somewhere" args={{ step: { tool: 'go_to', label: 'Took you to /library', status: 'done' } }} />
