<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatTool from './ChatTool.svelte';

	const { Story } = defineMeta({
		title: 'Chat/ChatTool',
		component: ChatTool,
		args: { step: { tool: 'search_site', label: 'Searched the site for “cooperatives”', status: 'done', links: [{ url: '/library/', title: 'Library' }, { url: '/wiki/cooperatives', title: 'Cooperatives' }] } }
	});
</script>

<!-- Gray, like the site's other in-feed controls; links open on demand. -->
<Story name="Search with links" />

<Story name="Running" args={{ step: { tool: 'fetch_page', label: 'Read indieweb.org/Micropub', status: 'running' } }} />

<Story name="Failed" args={{ step: { tool: 'fetch_page', label: 'Read example.com/private', status: 'failed' } }} />

<Story name="Micropub" args={{ step: { tool: 'micropub_update_post', label: 'Updated a post', status: 'done' } }} />

<!-- `show_page`: the page as a card everyone reading can open. -->
<Story name="Page peek" args={{ step: { tool: 'show_page', label: 'Showed Syndication threads over Micropub', status: 'done', peek: { url: 'https://caseyagollan.com/2026/11/14/micropub-threads/', title: 'Syndication threads over Micropub', excerpt: 'A post can carry its social copy as a reply chain, and the endpoint advertises it in q=config.' } } }} />

<!-- `table_look`: the snapshot the assistant checked its layout against, items numbered, overlaps in red. Opens on demand. -->
<Story name="Table snapshot" args={{ step: { tool: 'table_look', label: 'Looked at the table', status: 'done', picture: { src: 'table-look.jpg', alt: 'What the assistant saw of the table, each item numbered' } } }} />

<Story name="Table change" args={{ step: { tool: 'table_arrange', label: 'Arranged the table in a grid', status: 'done' } }} />

<!-- `table_add`: one step puts a whole part of the table down, whatever it is made of. -->
<Story name="Table add" args={{ step: { tool: 'table_add', label: 'Added 6 notes, 1 link and results for “oliveros”', status: 'done' } }} />

<!-- `search_site` without words lists by date. -->
<Story name="Browsed by date" args={{ step: { tool: 'search_site', label: 'Looked through posts from the last 7 days', status: 'done', links: [{ url: '/2026/11/24/3mynekhkgwk2u/', title: 'Commission on Federal Paperwork, 1976–1977' }] } }} />

<Story name="Took you somewhere" args={{ step: { tool: 'go_to', label: 'Took you to /library', status: 'done' } }} />
