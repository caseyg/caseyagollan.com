<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { MCP_SERVERS, type McpConnection, type McpConnectionsState } from '$lib/mcp-servers';
	import McpConnections from './McpConnections.svelte';

	const day = 86_400_000;
	const now = Date.UTC(2026, 10, 25, 15);
	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 400));
	const base = (id: string): McpConnection => { const server = MCP_SERVERS.find((one) => one.id === id)!; return { id, name: server.name, summary: server.summary, connected: false, writes: false }; };
	const reads = (...names: string[]) => names.map((name) => ({ name, reads: true }));
	const changes = (...names: string[]) => names.map((name) => ({ name, reads: false }));

	const readwise: McpConnection = { ...base('readwise'), connected: true, via: 'oauth', connectedAt: now - 2 * day, toolsAt: now - 2 * day, tools: [...reads('reader_search_documents', 'reader_list_documents', 'reader_get_document_details', 'reader_get_document_highlights', 'reader_list_tags', 'readwise_search_highlights', 'readwise_list_highlights'), ...changes('reader_create_document', 'reader_add_tags_to_document', 'reader_move_documents', 'readwise_create_highlights')] };
	const arena: McpConnection = { ...base('arena'), via: 'token', toolsAt: now - day, tools: [...reads('getChannel', 'getChannelContents', 'getBlock', 'getUserContents', 'search', 'channelDigest'), ...changes('createBlock', 'createChannel', 'createConnection', 'searchAndConnect', 'updateBlock', 'deleteConnection')] };
	const none: McpConnectionsState = { configured: true, connections: MCP_SERVERS.map((server) => base(server.id)) };
	const some: McpConnectionsState = { configured: true, connections: [readwise, arena, base('raindrop')] };

	/** Answers each change the way the server would, so a story can be tried. */
	const stand = (state: McpConnectionsState) => {
		let current = state;
		return {
			load: later(current),
			act: (action: string, id: string, value?: boolean) => new Promise<McpConnectionsState & { error?: string }>((resolve) => setTimeout(() => {
				if (action === 'connect') return resolve({ ...current, error: 'Stories don’t open a sign-in page.' });
				current = { ...current, connections: current.connections.map((connection) => connection.id !== id ? connection : action === 'disconnect' ? base(id) : action === 'writes' ? { ...connection, writes: value === true } : { ...connection, toolsAt: Date.now() }) };
				resolve(current);
			}, 400))
		};
	};

	const { Story } = defineMeta({ title: 'Site/McpConnections', component: McpConnections, parameters: { docs: { story: { height: '460px' } } } });
</script>

<!-- On /account, for the signed-in owner: the services the chat can ask as Casey. -->
<Story name="Nothing connected" args={stand(none)} />

<!-- Readwise signed in with OAuth; Are.na working from the token saved with the site; Raindrop not yet. -->
<Story name="Some connected" args={stand(some)} />

<!-- Back from a service's sign-in page. -->
<Story name="Just connected" args={{ ...stand(some), result: 'connected', server: 'readwise' }} />

<!-- Changes allowed for one service: every tool is open to the chat. -->
<Story name="Changes allowed" args={stand({ ...some, connections: [{ ...readwise, writes: true }, arena, base('raindrop')] })} />

<!-- The service ended the sign-in (revoked, or a refresh was refused). -->
<Story name="Needs reconnecting" args={stand({ ...some, connections: [{ ...base('readwise'), broken: { at: now - day, reason: 'Readwise ended the sign-in (invalid_grant)' } }, arena, base('raindrop')] })} />

<Story name="Sign-in failed" args={{ ...stand(none), result: 'error', message: 'Raindrop access was not allowed.' }} />

<!-- Connected, but the service didn't answer when asked what it offers. -->
<Story name="Tools not listed" args={stand({ ...some, connections: [{ ...readwise, tools: undefined, toolsAt: undefined }, base('arena'), base('raindrop')] })} />

<!-- Inside a settings group that has its own heading. -->
<Story name="Without its heading" args={{ ...stand(some), bare: true }} />

<Story name="Not set up" args={{ load: later({ configured: false, connections: [] }) }} />

<Story name="Phone" args={stand(some)} parameters={{ viewport: { defaultViewport: 'mobile1' } }} globals={{ viewport: { value: 'mobile1' } }} />
