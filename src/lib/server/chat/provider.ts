/**
 * The chat's models as pi-ai providers, built from the registry in `chat-models.ts`: every
 * provider whose Worker secret is set (inference.coop, Anthropic, Cerebras), each with its own
 * API, address, key and prices. Keys are read at each request. A thread answers with the model
 * `CHAT_MODEL` names until Casey picks another in the composer's Model menu.
 */
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import type { Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { CHAT_PROVIDERS, DEFAULT_CHAT_MODEL, DEFAULT_CHAT_PROVIDER, modelKey, modelOptions, modelPrice, modelSpec, type ChatModelOption, type ChatModelSpec, type ChatProviderSpec } from '../../chat-models';

export const PROVIDER_ID = DEFAULT_CHAT_PROVIDER;

/**
 * The context Pi assumes, well under what the model takes (it answers past 90k tokens). Pi
 * compacts a thread's history into a summary as it nears this, which keeps each request (and
 * its cost) bounded however long the chat. At 32k, with Pi's default 16k held back for the
 * answer, one table answer (13k tokens of tools, prompt and search results) on top of a few
 * earlier ones started a blocking compaction mid-answer, and a failed one ended the answer
 * with “the model answered with an error” (chat dm2wwyw4rf).
 */
const CONTEXT_WINDOW = 64_000;

/**
 * Pi's compaction, sized for that window: compact in the background past 40k, block only past
 * 56k (8k held back covers the 4k answer), and keep the newest 16k as they were.
 */
export const COMPACTION = { reserveTokens: 8_000, backgroundTokens: 16_000, keepRecentTokens: 16_000 };

export interface ChatModelEnv { INFERENCE_COOP_API_KEY?: string; ANTHROPIC_API_KEY?: string; CEREBRAS_API_KEY?: string; CHAT_MODEL?: string; CHAT_INFERENCE_URL?: string; CHAT_REASONING_EFFORT?: string }

/** A model by its provider and id, as Pi keeps it with a session. */
export interface ChatModelRef { provider: string; id: string }

function openAIModel(provider: ChatProviderSpec, spec: ChatModelSpec, baseUrl: string, effort: string): Model<'openai-completions'> {
	return {
		id: spec.id, name: spec.name, api: 'openai-completions', provider: provider.id, baseUrl,
		// `reasoning` with every level mapped to one effort: pi-ai then always sends `reasoning_effort`.
		// Unset, GLM thinks without limit and sometimes returns no text at all.
		reasoning: true, thinkingLevelMap: { off: effort, minimal: effort, low: effort, medium: effort, high: effort, xhigh: effort },
		// glm-flash (GLM 5.3) reads images: `view_image` and `table_look` send pictures.
		input: spec.images ? ['text', 'image'] : ['text'],
		// Dollars per million tokens, so each answer's usage carries its cost.
		cost: { input: spec.price.input, output: spec.price.output, cacheRead: spec.price.cacheRead ?? spec.price.input, cacheWrite: spec.price.cacheWrite ?? 0 },
		contextWindow: CONTEXT_WINDOW, maxTokens: 4000,
		// Plain chat completions, nothing vendor-specific (inference.coop is LiteLLM in front of several model families).
		compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: true, maxTokensField: 'max_tokens', requiresNonNullAssistantContent: true }
	};
}

function anthropicModel(provider: ChatProviderSpec, spec: ChatModelSpec, effort: string): Model<'anthropic-messages'> {
	return {
		id: spec.id, name: spec.name, api: 'anthropic-messages', provider: provider.id, baseUrl: provider.baseUrl,
		// Claude's thinking is adaptive and, on the larger models, can't be turned off (`off: null`): every
		// level asks for the one effort, and the chat's request hook does the same should Pi ask for none.
		reasoning: true, thinkingLevelMap: { off: null, minimal: effort, low: effort, medium: effort, high: effort, xhigh: effort },
		input: spec.images ? ['text', 'image'] : ['text'],
		cost: { input: spec.price.input, output: spec.price.output, cacheRead: spec.price.cacheRead ?? spec.price.input / 10, cacheWrite: spec.price.cacheWrite ?? spec.price.input * 1.25 },
		contextWindow: CONTEXT_WINDOW, maxTokens: 4000,
		/*
		 * Prompt caching: pi-ai marks the tools, the system prompt and the newest message as cache
		 * breakpoints on every request (five-minute retention, renewed by each hit), and Pi's transcript
		 * only ever grows, so each step re-reads everything before it at a tenth of the price. What keeps
		 * that true here: prompt sections that change mid-chat (the open table's listing) go in as system
		 * messages after the history, never as edits to the prompt, and the request hook adds nothing
		 * to a Claude request that isn't in the transcript.
		 */
		compat: { forceAdaptiveThinking: true, supportsTemperature: false, supportsMidConvoSystemMessages: true, supportsCacheControlOnTools: true }
	};
}

/**
 * The providers that can answer here, as pi-ai `Models`; the model new threads start with
 * (`model`); the Model menu's options; and `resolve`, which turns a menu key into a model
 * reference, or nothing when that model can't answer here any more (its key was removed).
 */
export function chatModels(env: ChatModelEnv) {
	const effort = env.CHAT_REASONING_EFFORT || 'low';
	const wanted = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;
	const keys: Record<ChatProviderSpec['secret'], () => string | undefined> = { INFERENCE_COOP_API_KEY: () => env.INFERENCE_COOP_API_KEY, ANTHROPIC_API_KEY: () => env.ANTHROPIC_API_KEY, CEREBRAS_API_KEY: () => env.CEREBRAS_API_KEY };
	const models = createModels();
	const offered: ChatProviderSpec[] = [];
	for (const listed of CHAT_PROVIDERS) {
		// inference.coop is always registered, so a Worker without its key answers “the chat model isn’t set up here yet”.
		if (!keys[listed.secret]() && listed.id !== DEFAULT_CHAT_PROVIDER) continue;
		// `CHAT_MODEL` may name a gateway model the registry doesn't list: it joins inference.coop's.
		const extra = listed.id === DEFAULT_CHAT_PROVIDER && !modelSpec(wanted) ? [{ id: wanted, name: wanted, detail: 'Set by CHAT_MODEL', price: modelPrice(wanted), images: true }] : [];
		const spec: ChatProviderSpec = { ...listed, models: [...listed.models, ...extra] };
		// `CHAT_INFERENCE_URL` stands in for the gateway in local testing.
		const baseUrl = listed.id === DEFAULT_CHAT_PROVIDER ? env.CHAT_INFERENCE_URL || listed.baseUrl : listed.baseUrl;
		const auth = { apiKey: { name: `${listed.name} API key`, resolve: async () => { const apiKey = keys[listed.secret](); return apiKey ? { auth: { apiKey }, source: listed.secret } : undefined; } } };
		if (listed.api === 'anthropic-messages') models.setProvider(createProvider({ id: spec.id, name: spec.name, baseUrl, auth, models: spec.models.map((model) => anthropicModel(spec, model, effort)), api: anthropicMessagesApi() }));
		else models.setProvider(createProvider({ id: spec.id, name: spec.name, baseUrl, auth, models: spec.models.map((model) => openAIModel(spec, model, baseUrl, effort)), api: openAICompletionsApi() }));
		if (keys[listed.secret]()) offered.push(spec);
	}
	const options: ChatModelOption[] = modelOptions(offered);
	const listed = modelSpec(wanted);
	// `CHAT_MODEL` on a provider that can't answer here falls back to inference.coop's default.
	const model: ChatModelRef = listed && offered.some((one) => one.id === listed.provider.id) ? { provider: listed.provider.id, id: wanted } : { provider: PROVIDER_ID, id: listed && listed.provider.id !== PROVIDER_ID ? DEFAULT_CHAT_MODEL : wanted };
	const resolve = (key: string | undefined): ChatModelRef | undefined => {
		const option = key ? options.find((one) => one.key === key) : undefined;
		if (!option) return undefined;
		const at = option.key.indexOf(':');
		return { provider: option.key.slice(0, at), id: option.key.slice(at + 1) };
	};
	return { models, model, options, resolve, defaultKey: modelKey(model.provider, model.id) };
}

/** Whether a request body is for Anthropic's Messages API, by the model it names. */
export const isAnthropicModel = (id: unknown) => typeof id === 'string' && modelSpec(id)?.provider.api === 'anthropic-messages';
