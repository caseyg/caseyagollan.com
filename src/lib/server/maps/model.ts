/**
 * The two small questions a map asks a model: which candidate sentence is a document's quote, and
 * whether a picture shows a recognizable person. One plain completion each, on inference.coop,
 * outside the chat's own run (as thread naming is). Without a key there is no model, and the
 * stages fall back: quotes by rule, pictures to title tiles.
 */
import { DEFAULT_CHAT_MODEL, INFERENCE_BASE_URL } from '../chat/model';

export interface MapModelEnv { INFERENCE_COOP_API_KEY?: string; CHAT_MODEL?: string; CHAT_INFERENCE_URL?: string }
export interface Picture { mimeType: string; data: string }
export interface MapModel {
	choose(prompt: string): Promise<string>;
	/** One word about each picture, in order. */
	look(prompt: string, pictures: Picture[]): Promise<string>;
}

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export function mapModel(env: MapModelEnv, fetcher: typeof fetch = fetch): MapModel | undefined {
	const apiKey = env.INFERENCE_COOP_API_KEY;
	if (!apiKey) return undefined;
	// The registry's default reads pictures; a chat model from another provider can't be asked here.
	const model = env.CHAT_MODEL && !env.CHAT_MODEL.includes(':') ? env.CHAT_MODEL : DEFAULT_CHAT_MODEL;
	const ask = async (content: string | Part[], maxTokens: number): Promise<string> => {
		const response = await fetcher(`${env.CHAT_INFERENCE_URL || INFERENCE_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({ model, stream: false, max_tokens: maxTokens, reasoning_effort: 'low', temperature: 0, messages: [{ role: 'user', content }] }),
			signal: AbortSignal.timeout(45_000)
		});
		if (!response.ok) { await response.body?.cancel(); throw new Error(`inference.coop answered ${response.status}`); }
		const data = await response.json() as { choices?: { message?: { content?: string | null } }[] };
		return data.choices?.[0]?.message?.content ?? '';
	};
	return {
		choose: (prompt) => ask(prompt, 1200),
		look: (prompt, pictures) => ask([{ type: 'text', text: prompt }, ...pictures.map((picture): Part => ({ type: 'image_url', image_url: { url: `data:${picture.mimeType};base64,${picture.data}` } }))], 600)
	};
}
