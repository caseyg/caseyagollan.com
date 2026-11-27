/**
 * The bridge from MCP servers to Pi: each tool of each connected server (Readwise, Are.na,
 * Raindrop; see `$lib/mcp-servers`) becomes a Pi tool named `mcp__<server>__<tool>`.
 *
 * They are for scripts only (`callers: ['tools']`): the model is never offered them one by
 * one, which would cost thousands of tokens of schemas on every request. It gets one tool,
 * `codemode` (Pi Durable's code mode), and writes a short script that calls them as
 * `await tools.mcp__readwise__…(args)`; only what the script returns reaches the model.
 * The `codemode` prompt section lists the tools' signatures as far as its budget allows, and
 * scripts find the rest with `searchTools()` and `describeTool()`.
 *
 * Like `my_saves`, these act with Casey's own sign-ins and read private things, so both
 * `codemode` and every `mcp__` tool are Casey's tools (`isOwnerTool` in `tools.ts`): offered
 * and run only when Casey alone is asking.
 */
import type { Extension, PromptSection, ToolRegistration } from '@earendil-works/pi-durable';
import type { McpServer } from '../../mcp-servers';
import { readsOnly, type McpTool, type McpToolResult } from '../mcp/client';

export const MCP_PREFIX = 'mcp__';
export const CODEMODE_TOOL = 'codemode';
/** The name of the Pi extension holding the bridged tools; installed again whenever the connections change. */
export const MCP_EXTENSION = 'mcp';
export const isMcpTool = (name: string) => name.startsWith(MCP_PREFIX);

export const mcpPrefix = (server: Pick<McpServer, 'id'>) => `${MCP_PREFIX}${server.id}__`;
export const mcpToolName = (server: Pick<McpServer, 'id'>, tool: string) => `${mcpPrefix(server)}${tool.replace(/[^A-Za-z0-9_]/g, '_')}`;

/** The most of one result a script is handed. Scripts pick out what the model needs from it. */
const RESULT_MAX = 400_000;
const DESCRIPTION_MAX = 600;

/** Calls one tool of one server; the Worker's does it with Casey's sign-in. */
export type McpCall = (server: McpServer, tool: string, args: Record<string, unknown>) => Promise<McpToolResult>;

export interface BridgedServer { server: McpServer; tools: McpTool[] }

/** A tool's input schema as Pi takes it: always an object schema, without the draft marker. */
export function parametersOf(tool: McpTool): Record<string, unknown> {
	const { $schema: _draft, ...schema } = (tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {}) as Record<string, unknown>;
	return { ...schema, type: 'object', properties: schema.properties && typeof schema.properties === 'object' ? schema.properties : {} };
}

export function mcpTools(servers: readonly BridgedServer[], call: McpCall): ToolRegistration[] {
	const seen = new Set<string>();
	return servers.flatMap(({ server, tools }) => tools.flatMap((tool): ToolRegistration[] => {
		const name = mcpToolName(server, tool.name);
		if (seen.has(name)) return [];
		seen.add(name);
		const reads = readsOnly(tool);
		return [{
			name,
			description: (tool.description ?? tool.name).trim().slice(0, DESCRIPTION_MAX),
			parameters: parametersOf(tool),
			callers: ['tools'],
			// A read may run again after a restart; a change must not happen twice.
			...(reads ? { replay: 'safe' as const } : {}),
			outputLimits: { maxBytes: RESULT_MAX * 2, maxLines: 100_000 },
			async execute(args) {
				const result = await call(server, tool.name, (args ?? {}) as Record<string, unknown>);
				if (result.isError) throw new Error(result.text.slice(0, 600) || `${server.name} reported an error.`);
				const text = result.text.length > RESULT_MAX ? `${result.text.slice(0, RESULT_MAX)}\n[Cut: ${result.text.length - RESULT_MAX} more characters. Ask for less at a time.]` : result.text;
				return { output: [{ type: 'text' as const, text }, ...result.images.slice(0, 4).map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType }))] };
			}
		}];
	}));
}

/** The bridged tools as a Pi extension. It has no prompt of its own: `codemode`'s section describes them. */
export function mcpExtension(servers: readonly BridgedServer[], call: McpCall): Extension {
	return { name: MCP_EXTENSION, tools: mcpTools(servers, call) };
}

/** The servers as code mode's namespaces: the heading and guide over each server's tools. */
export function mcpNamespaces(servers: readonly Pick<BridgedServer, 'server'>[]) {
	return servers.map(({ server }) => ({ name: server.name, prefix: mcpPrefix(server), description: server.guide }));
}

/** The connected servers by name, for the chat's own prompt: “Readwise, Are.na and Raindrop”. */
export function serverNames(servers: readonly Pick<BridgedServer, 'server'>[]): string {
	const names = servers.map(({ server }) => server.name);
	return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** An extension whose prompt sections only render while `shown()` holds; its tools and hooks are untouched. */
export function sectionsWhen(extension: Extension, shown: () => boolean): Extension {
	return { ...extension, sections: extension.sections?.map((section): PromptSection => ({ ...section, render: (input, context) => shown() ? section.render(input, context) : undefined })) };
}

/** Tokens of output one script may hand the model, unless its own options line says otherwise. Code mode's default is 10,000. */
export const SCRIPT_OUTPUT_TOKENS = 4000;

/** A script with the chat's output budget as its options line, when it has none of its own. */
export function withOutputBudget(code: string): string {
	return /^\s*\/\/\s*@options:/.test(code) ? code : `// @options: {"max_output_tokens": ${SCRIPT_OUTPUT_TOKENS}}\n${code}`;
}

/** The code mode extension with the chat's output budget on every script. */
export function budgeted(extension: Extension): Extension {
	return {
		...extension, tools: extension.tools?.map((tool): ToolRegistration => tool.name !== CODEMODE_TOOL ? tool : {
			...tool,
			prepareArguments: (args: unknown) => { const given = (args ?? {}) as { code?: unknown }; return typeof given.code === 'string' && given.code.trim() ? { ...given, code: withOutputBudget(given.code) } : given; },
			// One log line per script: which servers' tools its code names, how long it ran and whether it failed. Never the code or what it returned.
			execute: async (args, api, context) => {
				const started = Date.now();
				const code = typeof (args as { code?: unknown })?.code === 'string' ? (args as { code: string }).code : '';
				const note = (extra: Record<string, unknown>) => console.log(JSON.stringify({ event: 'chat_script', calls: scriptCalls(code).slice(0, 12), finds: /\b(searchTools|describeTool|describeNamespace)\s*\(/.test(code), codeChars: code.length, ms: Date.now() - started, ...extra }));
				try {
					const result = await tool.execute(args as never, api, context);
					const output = (result as { output?: unknown })?.output;
					note({ chars: typeof output === 'string' ? output.length : JSON.stringify(output ?? '').length, ...((result as { isError?: boolean })?.isError ? { error: true } : {}) });
					return result;
				} catch (error) {
					note({ threw: (error as Error)?.name ?? 'Error' });
					throw error;
				}
			}
		})
	};
}

/** The `tools.mcp__…` calls a script makes, as readers see them: “Readwise: reader search documents”. */
export function scriptCalls(code: string, names: Record<string, string> = {}): string[] {
	const found = new Set<string>();
	for (const match of code.matchAll(/tools\s*(?:\.\s*|\[\s*["'`])mcp__([a-z0-9]+)__([A-Za-z0-9_]+)/g)) {
		found.add(`${names[match[1]] ?? match[1]}: ${match[2].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_+/g, ' ').trim().toLowerCase()}`);
	}
	return [...found];
}
