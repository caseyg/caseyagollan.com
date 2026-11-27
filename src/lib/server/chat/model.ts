/**
 * inference.coop's gateway speaks the OpenAI chat completions API
 * (https://gateway.inference.coop/v1, Bearer key in the `INFERENCE_COOP_API_KEY` Worker
 * secret). This streams one completion, passing text to `onText` as it arrives and
 * gathering tool calls, which come in pieces across chunks.
 */

export const INFERENCE_BASE_URL = 'https://gateway.inference.coop/v1';
export { DEFAULT_CHAT_MODEL } from '../../chat-models';

export interface ModelToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ModelMessage =
	| { role: 'system' | 'user'; content: string; name?: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ModelToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string };
export interface ModelTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export interface Completion { text: string; toolCalls: ModelToolCall[]; finishReason?: string }

/** `message` is safe to show in a public thread; `detail` is for the Worker log only. */
export class ModelError extends Error {
	constructor(message: string, public readonly detail = '') { super(message); }
}

export async function streamCompletion(options: {
	apiKey: string; model: string; baseUrl?: string; messages: ModelMessage[]; tools?: ModelTool[];
	onText?: (text: string) => void; signal?: AbortSignal; fetcher?: typeof fetch; maxTokens?: number; reasoningEffort?: string;
}): Promise<Completion> {
	const response = await (options.fetcher ?? fetch)(`${options.baseUrl ?? INFERENCE_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' },
		body: JSON.stringify({
			model: options.model, stream: true, messages: options.messages, max_tokens: options.maxTokens ?? 4000,
			// Unset, the gateway's GLM thinks without limit and can spend its whole allowance before writing a word.
			reasoning_effort: options.reasoningEffort ?? 'low',
			...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {})
		}),
		signal: options.signal
	});
	if (!response.ok || !response.body) {
		const detail = await response.text().catch(() => '');
		// Never echo the request (it carries the key); only the status and the gateway's short reason.
		throw new ModelError(`inference.coop answered ${response.status}`, detail.slice(0, 300));
	}
	const decoder = new TextDecoder();
	const calls = new Map<number, ModelToolCall>();
	let text = '', buffered = '', finishReason: string | undefined;
	const handle = (line: string) => {
		if (!line.startsWith('data:')) return;
		const data = line.slice(5).trim();
		if (!data || data === '[DONE]') return;
		let chunk: { choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]; error?: { message?: string } };
		try { chunk = JSON.parse(data); } catch { return; }
		if (chunk.error) throw new ModelError(chunk.error.message ?? 'The model stopped with an error');
		const choice = chunk.choices?.[0];
		if (!choice) return;
		if (choice.finish_reason) finishReason = choice.finish_reason;
		const delta = choice.delta;
		if (delta?.content) { text += delta.content; options.onText?.(delta.content); }
		for (const part of delta?.tool_calls ?? []) {
			const call = calls.get(part.index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
			if (part.id) call.id = part.id;
			if (part.function?.name) call.function.name += part.function.name;
			if (part.function?.arguments) call.function.arguments += part.function.arguments;
			calls.set(part.index, call);
		}
	};
	for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
		buffered += decoder.decode(chunk, { stream: true });
		const lines = buffered.split('\n');
		buffered = lines.pop() ?? '';
		for (const line of lines) handle(line.trim());
	}
	if (buffered.trim()) handle(buffered.trim());
	const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({ ...call, id: call.id || `call_${index}` })).filter((call) => call.function.name);
	return { text, toolCalls, finishReason };
}
