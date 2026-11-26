/**
 * The groups of tools a chat's assistant has, for the composer's Tools menu: the site's own
 * (search, navigation, saves, tables, publishing) and one per connected MCP server. Casey turns
 * a group, or one tool in it, off for one chat; the choice is kept with the thread.
 */
export interface ChatToolChoice {
	/** The tool as the assistant calls it. */
	name: string;
	/** The tool as Casey reads it. */
	label: string;
}

export interface ChatToolGroup {
	id: string;
	name: string;
	summary?: string;
	/** A connected service's tools, which scripts call, as opposed to the site's own. */
	service?: boolean;
	tools: ChatToolChoice[];
}

export interface ChatToolChoices {
	groups: ChatToolGroup[];
	/** What is off in this chat: `group:<id>` for a whole group, `tool:<name>` for one tool. */
	off: string[];
}

export const OFF_MAX = 400;
export const groupKey = (id: string) => `group:${id}`;
export const toolKey = (name: string) => `tool:${name}`;
export const mcpGroupId = (server: string) => `mcp:${server}`;

/** Off entries as they are kept: strings of the two kinds, once each. */
export function cleanOff(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length < 200 && /^(group|tool):[\w:.-]+$/.test(entry)))].slice(0, OFF_MAX);
}

export const groupOn = (off: readonly string[], group: Pick<ChatToolGroup, 'id'>) => !off.includes(groupKey(group.id));
export const toolOn = (off: readonly string[], group: Pick<ChatToolGroup, 'id'>, tool: Pick<ChatToolChoice, 'name'>) => groupOn(off, group) && !off.includes(toolKey(tool.name));
/** How many of a group's tools are on. */
export const toolsOn = (off: readonly string[], group: ChatToolGroup) => groupOn(off, group) ? group.tools.filter((tool) => !off.includes(toolKey(tool.name))).length : 0;

/** `off` with one entry turned on or off. */
export function withChoice(off: readonly string[], key: string, on: boolean): string[] {
	const rest = off.filter((entry) => entry !== key);
	return on ? rest : [...rest, key];
}

/** A tool's name as words: `reader_search_documents` and `getChannelContents` alike. */
export const toolWords = (name: string) => { const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase(); return words ? words[0].toUpperCase() + words.slice(1) : name; };
