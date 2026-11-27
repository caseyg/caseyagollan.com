/**
 * The models a chat can answer with, and who serves them: the registry the server builds its
 * providers from (`server/chat/provider.ts`), prices each answer with (`budget.ts`), and lists
 * in the composer's Model menu. A provider is offered only where its key is set, so adding a
 * provider is an entry here and a Worker secret.
 */

/** How a provider is spoken to: OpenAI's chat completions, or Anthropic's Messages API. */
export type ChatModelApi = 'openai-completions' | 'anthropic-messages';

export interface ChatModelSpec {
	/** The model as its provider names it. */
	id: string;
	/** The model as Casey reads it. */
	name: string;
	/** A shorter name for the composer's button, where the full one would crowd the box. */
	short?: string;
	/** A few words on what it is for. */
	detail: string;
	/** US dollars per million tokens. */
	price: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
	/** Reads pictures (`view_image`, `table_look`). */
	images?: boolean;
}

export interface ChatProviderSpec {
	id: string;
	name: string;
	api: ChatModelApi;
	baseUrl: string;
	/** The Worker secret holding its key. */
	secret: 'INFERENCE_COOP_API_KEY' | 'ANTHROPIC_API_KEY' | 'CEREBRAS_API_KEY';
	models: ChatModelSpec[];
}

export const CHAT_PROVIDERS: ChatProviderSpec[] = [
	{
		id: 'inference-coop', name: 'inference.coop', api: 'openai-completions', baseUrl: 'https://gateway.inference.coop/v1', secret: 'INFERENCE_COOP_API_KEY',
		models: [
			{ id: 'glm-flash-green', name: 'GLM Flash', detail: 'Quick and cheap, on renewable power', price: { input: 0.11, output: 0.44 }, images: true },
			{ id: 'greenpt/glm-5.3', name: 'GLM 5.3', detail: 'Larger and slower', price: { input: 1.1, output: 4.4 }, images: true }
		]
	},
	{
		id: 'anthropic', name: 'Anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', secret: 'ANTHROPIC_API_KEY',
		models: [
			{ id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', short: 'Haiku 5.5', detail: 'Quick and cheap', price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, images: true },
			{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', detail: 'Everyday work', price: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 }, images: true },
			{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5', short: 'Opus 5.5', detail: 'Hard questions', price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }, images: true }
		]
	},
	{
		id: 'cerebras', name: 'Cerebras', api: 'openai-completions', baseUrl: 'https://api.cerebras.ai/v1', secret: 'CEREBRAS_API_KEY',
		models: [
			{ id: 'gpt-oss-120b', name: 'GPT OSS 120B', short: 'GPT OSS', detail: 'Very fast', price: { input: 0.35, output: 0.75 } },
			{ id: 'qwen-3.8-27b', name: 'Qwen 3.8 27B', short: 'Qwen 3.8', detail: 'Very fast', price: { input: 0.99, output: 1.49 } }
		]
	}
];

/** The model new chats answer with unless `CHAT_MODEL` names another. */
export const DEFAULT_CHAT_MODEL = 'glm-flash-green';
export const DEFAULT_CHAT_PROVIDER = 'inference-coop';

/** A model in the Model menu. */
export interface ChatModelOption {
	/** `<provider>:<model id>`, what the browser sends back. */
	key: string;
	name: string;
	/** A shorter name for the button. */
	short?: string;
	detail: string;
	/** Who serves it, the heading it sits under. */
	provider: string;
}

/** To Casey only: the models this chat could answer with, and the one it does. */
export interface ChatModelChoices {
	models: ChatModelOption[];
	current: string;
}

export const modelKey = (provider: string, id: string) => `${provider}:${id}`;

/** Every listed model with its provider, by model id. Ids are unique across providers. */
const BY_ID = new Map(CHAT_PROVIDERS.flatMap((provider) => provider.models.map((model) => [model.id, { provider, model }] as const)));

export const modelSpec = (id: string) => BY_ID.get(id);

/** A model's name as people read it; an unlisted one keeps its id. */
export const modelName = (id: string) => BY_ID.get(id)?.model.name ?? id;

/** The dearest listed price, charged for a model the registry doesn't know. */
const DEAREST = { input: 4, output: 20 };
export const modelPrice = (id: string) => BY_ID.get(id)?.model.price ?? DEAREST;

/** The providers whose key is set, and so can answer. */
export function providersWith(env: Partial<Record<ChatProviderSpec['secret'], string | undefined>>): ChatProviderSpec[] {
	return CHAT_PROVIDERS.filter((provider) => !!env[provider.secret]);
}

/** The menu's options: every model of every provider that can answer here. */
export function modelOptions(providers: readonly ChatProviderSpec[]): ChatModelOption[] {
	return providers.flatMap((provider) => provider.models.map((model) => ({ key: modelKey(provider.id, model.id), name: model.name, ...(model.short ? { short: model.short } : {}), detail: model.detail, provider: provider.name })));
}

/** A key the browser sent, if it names one of the options. */
export function cleanModelKey(value: unknown, options: readonly ChatModelOption[]): string | null {
	return typeof value === 'string' && value.length < 200 && options.some((option) => option.key === value) ? value : null;
}
