import { describe, expect, test } from 'bun:test';
import { cleanOff, groupKey, groupOn, mcpGroupId, toolKey, toolOn, toolsOn, toolWords, withChoice, type ChatToolGroup } from '../src/lib/chat-tool-groups';
import { chatExtension, OWN_TOOL_GROUPS } from '../src/lib/server/chat/tools';

const tables: ChatToolGroup = { id: 'tables', name: 'Tables', tools: [{ name: 'table_read', label: 'Read' }, { name: 'table_draw', label: 'Draw' }] };

describe('tool groups Casey turns off per chat', () => {
	test('what is kept is only group and tool entries, once each', () => {
		expect(cleanOff(['group:tables', 'group:tables', 'tool:mcp__arena__getChannel', 'group:mcp:readwise', 'nonsense', 4, 'tool:<script>'])).toEqual(['group:tables', 'tool:mcp__arena__getChannel', 'group:mcp:readwise']);
		expect(cleanOff('group:tables')).toEqual([]);
	});

	test('a group off takes its tools with it; one tool off leaves the rest', () => {
		expect(toolsOn([], tables)).toBe(2);
		expect(toolsOn([toolKey('table_draw')], tables)).toBe(1);
		expect(toolOn([toolKey('table_draw')], tables, { name: 'table_read' })).toBe(true);
		expect(toolsOn([groupKey('tables')], tables)).toBe(0);
		expect(groupOn([groupKey('tables')], tables)).toBe(false);
		expect(withChoice([groupKey('tables')], groupKey('tables'), true)).toEqual([]);
		expect(withChoice([], groupKey(mcpGroupId('readwise')), false)).toEqual(['group:mcp:readwise']);
	});

	test('tool names read as words', () => {
		expect(toolWords('reader_search_documents')).toBe('Reader search documents');
		expect(toolWords('getChannelContents')).toBe('Get channel contents');
	});

	test('every tool the chat offers the model sits in one group', () => {
		const extension = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', thread: { table: () => 't' } as never });
		for (const tool of extension.tools ?? []) expect([tool.name, OWN_TOOL_GROUPS.filter((group) => group.has(tool.name)).length]).toEqual([tool.name, 1]);
	});

	test('a tool that is off is withheld from the request and refused if called', async () => {
		const off = new Set(['search_site']);
		const extension = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', onlyOwner: () => true, off: (name) => off.has(name) });
		const hooks = extension.hooks as unknown as { handlers: { beforeTool?: (call: unknown, api: unknown, context: unknown) => Promise<{ block?: string } | undefined>; beforeProviderRequest?: (request: unknown, api: unknown, context: unknown) => Promise<{ payload: { tools?: { function: { name: string } }[] } } | undefined> } }[];
		const api = { conversationId: 'c', snapshot: async () => ({ run: { turns: 0, first: 'e1' } }), entries: async () => ({ items: [] }) };
		let sent: string[] = [];
		for (const hook of hooks) { const changed = await hook.handlers.beforeProviderRequest?.({ payload: { tools: [{ type: 'function', function: { name: 'search_site' } }, { type: 'function', function: { name: 'fetch_page' } }], messages: [] } }, api, {}); if (changed) sent = (changed.payload.tools ?? []).map((tool) => tool.function.name); }
		expect(sent).toEqual(['fetch_page']);
		const refused = await Promise.all(hooks.map((hook) => hook.handlers.beforeTool?.({ name: 'search_site', arguments: {} }, api, {})));
		expect(refused.some((verdict) => verdict?.block?.includes('turned this tool off'))).toBe(true);
		const allowed = await Promise.all(hooks.map((hook) => hook.handlers.beforeTool?.({ name: 'fetch_page', arguments: {} }, api, {})));
		expect(allowed.every((verdict) => !verdict?.block)).toBe(true);
	});
});
