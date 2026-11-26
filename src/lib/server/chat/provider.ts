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

export function chatModels(env: { INFERENCE_COOP_API_KEY?: string; CHAT_MODEL?: string; CHAT_INFERENCE_URL?: string; CHAT_REASONING_EFFORT?: string }) {
	// Every request names how hard to think, compaction's summaries too (they skip the chat's
	// request hook). Unset, GLM thinks without limit and sometimes returns no text at all.
	const effort = env.CHAT_REASONING_EFFORT || 'low';
	const id = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;
	const baseUrl = env.CHAT_INFERENCE_URL || INFERENCE_BASE_URL;
	const model: Model<'openai-completions'> = {
		id, name: id, api: 'openai-completions', provider: PROVIDER_ID, baseUrl,
		// glm-flash (GLM 5.3) reads images: `view_image` and `table_look` send pictures.
		// `reasoning` with every level mapped to one effort: pi-ai then always sends `reasoning_effort`.
		reasoning: true, thinkingLevelMap: { off: effort, minimal: effort, low: effort, medium: effort, high: effort, xhigh: effort },
		input: ['text', 'image'],
		// Dollars per million tokens, so each answer's usage carries its cost.
		cost: { input: priceOf(id).input, output: priceOf(id).output, cacheRead: priceOf(id).input, cacheWrite: 0 },
		contextWindow: CONTEXT_WINDOW, maxTokens: 4000,
		// LiteLLM in front of several model families: plain chat completions, nothing vendor-specific.
		compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: true, maxTokensField: 'max_tokens', requiresNonNullAssistantContent: true }
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
