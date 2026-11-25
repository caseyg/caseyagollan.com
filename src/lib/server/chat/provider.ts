/**
 * inference.coop as a pi-ai provider: its OpenAI-compatible gateway, the model
 * `CHAT_MODEL` names, and the `INFERENCE_COOP_API_KEY` Worker secret, read at each request.
 */
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import type { Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { priceOf } from './budget';
import { DEFAULT_CHAT_MODEL, INFERENCE_BASE_URL } from './model';

export const PROVIDER_ID = 'inference-coop';

/**
 * The context Pi assumes. Small on purpose: Pi compacts a thread's history into a summary
 * as it nears this, which keeps each request (and its cost) bounded however long the chat.
 */
const CONTEXT_WINDOW = 32_000;

export function chatModels(env: { INFERENCE_COOP_API_KEY?: string; CHAT_MODEL?: string; CHAT_INFERENCE_URL?: string }) {
	const id = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;
	const baseUrl = env.CHAT_INFERENCE_URL || INFERENCE_BASE_URL;
	const model: Model<'openai-completions'> = {
		id, name: id, api: 'openai-completions', provider: PROVIDER_ID, baseUrl,
		// glm-flash (GLM 5.3) reads images: `view_image` and `table_look` send pictures.
		reasoning: false, input: ['text', 'image'],
		// Dollars per million tokens, so each answer's usage carries its cost.
		cost: { input: priceOf(id).input, output: priceOf(id).output, cacheRead: priceOf(id).input, cacheWrite: 0 },
		contextWindow: CONTEXT_WINDOW, maxTokens: 4000,
		// LiteLLM in front of several model families: plain chat completions, nothing vendor-specific.
		compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', requiresNonNullAssistantContent: true }
	};
	const provider = createProvider({
		id: PROVIDER_ID, name: 'inference.coop', baseUrl,
		auth: { apiKey: { name: 'inference.coop API key', resolve: async () => env.INFERENCE_COOP_API_KEY ? { auth: { apiKey: env.INFERENCE_COOP_API_KEY }, source: 'INFERENCE_COOP_API_KEY' } : undefined } },
		models: [model],
		api: openAICompletionsApi()
	});
	const models = createModels();
	models.setProvider(provider);
	return { models, model: { provider: PROVIDER_ID, id } };
}
