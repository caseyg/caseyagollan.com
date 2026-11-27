import { describe, expect, test } from 'bun:test';
import { CHAT_PROVIDERS, cleanModelKey, modelKey, modelName, modelOptions, modelPrice, providersWith } from '../src/lib/chat-models';
import { chatModels, isAnthropicModel } from '../src/lib/server/chat/provider';
import { chatExtension } from '../src/lib/server/chat/tools';

describe('chat model registry', () => {
	test('offers only providers whose key is set', () => {
		expect(providersWith({ INFERENCE_COOP_API_KEY: 'k' }).map((provider) => provider.id)).toEqual(['inference-coop']);
		expect(providersWith({ INFERENCE_COOP_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' }).map((provider) => provider.id)).toEqual(['inference-coop', 'anthropic']);
		expect(providersWith({})).toEqual([]);
	});

	test('names and prices models by id, and prices unknown ones at the dearest', () => {
		expect(modelName('glm-flash-green')).toBe('GLM Flash');
		expect(modelName('something-else')).toBe('something-else');
		expect(modelPrice('claude-haiku-5-5')).toMatchObject({ input: 0.1, output: 0.5 });
		expect(modelPrice('something-else')).toEqual({ input: 4, output: 20 });
	});

	test('model ids are unique across providers', () => {
		const ids = CHAT_PROVIDERS.flatMap((provider) => provider.models.map((model) => model.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	test('accepts only keys that are on the menu', () => {
		const options = modelOptions(providersWith({ INFERENCE_COOP_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' }));
		expect(cleanModelKey('anthropic:claude-opus-5-5', options)).toBe('anthropic:claude-opus-5-5');
		expect(cleanModelKey('cerebras:gpt-oss-120b', options)).toBeNull();
		expect(cleanModelKey({ key: 'anthropic:claude-opus-5-5' }, options)).toBeNull();
	});
});

describe('chatModels', () => {
	test('with only inference.coop, the default is its model and the menu has just its models', () => {
		const catalog = chatModels({ INFERENCE_COOP_API_KEY: 'k' });
		expect(catalog.model).toEqual({ provider: 'inference-coop', id: 'glm-flash-green' });
		expect(catalog.options.every((option) => option.provider === 'inference.coop')).toBe(true);
		expect(catalog.resolve('anthropic:claude-opus-5-5')).toBeUndefined();
	});

	test('each keyed provider is registered with its own API and address', () => {
		const catalog = chatModels({ INFERENCE_COOP_API_KEY: 'k', ANTHROPIC_API_KEY: 'a', CEREBRAS_API_KEY: 'c' });
		const claude = catalog.models.getModel('anthropic', 'claude-sonnet-5-5');
		expect(claude).toMatchObject({ api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 } });
		// Thinking is never asked to be off, and changing prompt sections go after the history, so the cached prefix holds.
		expect(claude).toMatchObject({ thinkingLevelMap: { off: null }, compat: { supportsMidConvoSystemMessages: true } });
		expect(catalog.models.getModel('cerebras', 'gpt-oss-120b')).toMatchObject({ api: 'openai-completions', baseUrl: 'https://api.cerebras.ai/v1', input: ['text'] });
		expect(catalog.resolve(modelKey('anthropic', 'claude-sonnet-5-5'))).toEqual({ provider: 'anthropic', id: 'claude-sonnet-5-5' });
		expect(catalog.resolve('greenpt/glm-5.3')).toBeUndefined();
		expect(catalog.resolve(modelKey('inference-coop', 'greenpt/glm-5.3'))).toEqual({ provider: 'inference-coop', id: 'greenpt/glm-5.3' });
	});

	test('CHAT_MODEL picks the default: a listed model on its provider, an unlisted one on the gateway', () => {
		expect(chatModels({ INFERENCE_COOP_API_KEY: 'k', ANTHROPIC_API_KEY: 'a', CHAT_MODEL: 'claude-haiku-5-5' }).model).toEqual({ provider: 'anthropic', id: 'claude-haiku-5-5' });
		// Its provider has no key here: back to the gateway's default.
		expect(chatModels({ INFERENCE_COOP_API_KEY: 'k', CHAT_MODEL: 'claude-haiku-5-5' }).model).toEqual({ provider: 'inference-coop', id: 'glm-flash-green' });
		const custom = chatModels({ INFERENCE_COOP_API_KEY: 'k', CHAT_MODEL: 'greenpt/deepseek-v4.1-flash' });
		expect(custom.model).toEqual({ provider: 'inference-coop', id: 'greenpt/deepseek-v4.1-flash' });
		expect(custom.models.getModel('inference-coop', 'greenpt/deepseek-v4.1-flash')).toBeTruthy();
	});

	test('the local relay address stands in for the gateway only', () => {
		const catalog = chatModels({ INFERENCE_COOP_API_KEY: 'k', ANTHROPIC_API_KEY: 'a', CHAT_INFERENCE_URL: 'http://localhost:8788/v1' });
		expect(catalog.models.getModel('inference-coop', 'glm-flash-green')?.baseUrl).toBe('http://localhost:8788/v1');
		expect(catalog.models.getModel('anthropic', 'claude-opus-5-5')?.baseUrl).toBe('https://api.anthropic.com');
	});
});

describe('the request hook speaks each provider’s dialect', () => {
	type Before = (request: unknown, api: unknown, context: unknown) => Promise<{ payload: Record<string, unknown> } | undefined>;
	const before = (maxTurns = 8): Before => {
		const extension = chatExtension({ env: {} as never, origin: () => 'https://caseyagollan.com/', maxTurns });
		const hooks = extension.hooks as unknown as { handlers: { beforeProviderRequest?: Before } }[];
		return hooks.find((hook) => hook.handlers.beforeProviderRequest)!.handlers.beforeProviderRequest!;
	};
	const api = (turns: number) => ({ conversationId: 'c', snapshot: async () => ({ run: { turns } }) });

	test('isAnthropicModel goes by the registry', () => {
		expect(isAnthropicModel('claude-opus-5-5')).toBe(true);
		expect(isAnthropicModel('glm-flash-green')).toBe(false);
		expect(isAnthropicModel(undefined)).toBe(false);
	});

	test('OpenAI-style providers get reasoning_effort', async () => {
		const result = await before()({ payload: { model: 'gpt-oss-120b', messages: [] } }, api(0), {});
		expect(result?.payload.reasoning_effort).toBe('low');
	});

	test('Claude gets adaptive thinking and an effort, never reasoning_effort or disabled thinking', async () => {
		const result = await before()({ payload: { model: 'claude-opus-5-5', thinking: { type: 'disabled' }, messages: [] } }, api(0), {});
		expect(result?.payload).not.toHaveProperty('reasoning_effort');
		expect(result?.payload.thinking).toEqual({ type: 'adaptive' });
		expect(result?.payload.output_config).toEqual({ effort: 'low' });
		const kept = await before()({ payload: { model: 'claude-opus-5-5', thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'medium' }, messages: [] } }, api(0), {});
		expect(kept?.payload.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(kept?.payload.output_config).toEqual({ effort: 'medium' });
	});

	test('on the last round Claude keeps its tools and is told to call none', async () => {
		const tools = [{ name: 'search_site' }];
		const claude = await before(3)({ payload: { model: 'claude-haiku-5-5', tools, messages: [{ role: 'user', content: 'hi' }] } }, api(2), {});
		expect(claude?.payload.tools).toEqual(tools);
		expect(claude?.payload.tool_choice).toEqual({ type: 'none' });
		// Nothing is added that the transcript doesn't hold: the cached history stays as it was.
		expect((claude?.payload.messages as unknown[]).length).toBe(1);
		const other = await before(3)({ payload: { model: 'glm-flash-green', tools: [{ function: { name: 'search_site' } }], messages: [{ role: 'user', content: 'hi' }] } }, api(2), {});
		expect(other?.payload).not.toHaveProperty('tools');
	});
});
