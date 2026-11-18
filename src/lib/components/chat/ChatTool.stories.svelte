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
