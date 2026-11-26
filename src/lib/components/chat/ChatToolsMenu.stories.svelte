<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { groupKey, mcpGroupId, toolKey, toolWords, type ChatToolChoices, type ChatToolGroup } from '$lib/chat-tool-groups';
	import ChatToolsMenu from './ChatToolsMenu.svelte';

	const tools = (...names: string[]) => names.map((name) => ({ name, label: toolWords(name.replace(/^(table|micropub|mcp__[a-z]+_)_/, '')) }));
	const groups: ChatToolGroup[] = [
		{ id: 'site', name: 'Site search and pages', summary: 'Search the site, read pages and look at pictures.', tools: tools('search_site', 'fetch_page', 'show_page', 'view_image') },
		{ id: 'navigation', name: 'Navigation', summary: 'Take you to a page of the site.', tools: tools('go_to') },
		{ id: 'saves', name: 'Saves', summary: 'List what you saved on Are.na, Raindrop and Readwise.', tools: tools('my_saves') },
		{ id: 'tables', name: 'Tables', summary: 'Read and change the open table, or start one.', tools: tools('table_new', 'table_read', 'table_add', 'table_pull', 'table_arrange', 'table_move', 'table_connect', 'table_group', 'table_edit', 'table_draw', 'table_select', 'table_look') },
		{ id: 'publishing', name: 'Publishing', summary: 'Read, write and edit posts.', tools: tools('micropub_list_posts', 'micropub_get_post', 'micropub_create_post', 'micropub_update_post') },
		{ id: mcpGroupId('readwise'), name: 'Readwise', service: true, tools: tools('mcp__readwise__reader_search_documents', 'mcp__readwise__reader_list_documents', 'mcp__readwise__reader_get_document_details', 'mcp__readwise__readwise_search_highlights') },
		{ id: mcpGroupId('arena'), name: 'Are.na', service: true, tools: tools('mcp__arena__getChannel', 'mcp__arena__getChannelContents', 'mcp__arena__getBlock', 'mcp__arena__channelDigest') }
	];
	const all: ChatToolChoices = { groups, off: [] };

	const { Story } = defineMeta({ title: 'Chat/ChatToolsMenu', component: ChatToolsMenu, parameters: { docs: { story: { height: '520px' } } }, args: { choices: all, open: true, onchange: () => {} } });
</script>

<script lang="ts">
	let off = $state<string[]>([groupKey('publishing'), toolKey('table_draw')]);
</script>

<!-- In the composer of Casey's own chats: every group of the assistant's tools, on or off for this chat. The button counts the groups that were changed. -->
<Story name="Choosing">
	{#snippet template(args)}
		<ChatToolsMenu {...args} choices={{ groups, off }} onchange={(next) => (off = next)} />
	{/snippet}
</Story>

<Story name="Everything on" />

<!-- Inside a group: one switch per tool. -->
<Story name="Inside a group" args={{ inside: 'tables', choices: { groups, off: [toolKey('table_draw'), toolKey('table_look')] } }} />

<!-- A whole group off: its tools show off and can't be changed until it's back on. -->
<Story name="Group off" args={{ inside: mcpGroupId('readwise'), choices: { groups, off: [groupKey(mcpGroupId('readwise'))] } }} />

<!-- No service connected yet: only the site's own groups, and the link to connect one. -->
<Story name="No services" args={{ choices: { groups: groups.filter((group) => !group.service), off: [] } }} />

<Story name="Closed" args={{ open: false, choices: { groups, off: [groupKey('saves')] } }} />
