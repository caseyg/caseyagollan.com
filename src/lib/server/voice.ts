/**
 * The Worker's side of voice notes on tables (`src/lib/voice-notes.ts` has the rules).
 *
 * Listening: the owner's browser opens a WebSocket and sends its microphone as raw 16-bit PCM;
 * the Worker hands that socket to a Workers AI speech model, which answers on it with what it
 * hears, as it hears it. Deepgram's Flux is the default because it marks the end of a turn of
 * speech, which is where one block ends and the next begins. No audio is kept anywhere.
 *
 * Refining: one small completion about a finished block (fix what was misheard, name the block
 * it follows), answered by whichever of the chat's providers can answer here.
 */
import { VOICE_MODEL, VOICE_TERMS_MAX, cleanWords, parseRefine, readable, refineLog, refinePrompt, shortIds, type VoiceRefineAnswer, type VoiceRefineRequest } from '../voice-notes';
import { CHAT_PROVIDERS } from '../chat-models';
import { chatModels, type ChatModelEnv } from './chat/provider';

export interface VoiceEnv extends ChatModelEnv {
	AI?: { run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> };
	/** Another Workers AI realtime speech model, such as `@cf/deepgram/nova-3` for languages Flux doesn't hear. */
	VOICE_MODEL?: string;
	/** The model that corrects and places blocks, as the Model menu names it (`anthropic:claude-haiku-5-5`); the chat's own otherwise. */
	VOICE_TEXT_MODEL?: string;
	/** `on` sends the known words to the speech model as key terms. Off by default: Flux closed the socket when given them. */
	VOICE_KEYTERMS?: string;
}

const refuse = (status: number, message: string) => new Response(message, { status, headers: { 'cache-control': 'no-store' } });

function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	try {
		return !!origin && new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
}

/** What each model is asked for: 16-bit PCM at the browser's rate, words as they come, and pauses marked. */
export function listenOptions(model: string, rate: number): Record<string, string> {
	const audio = { encoding: 'linear16', sample_rate: String(rate) };
	// Flux ends a turn when it is fairly sure the speaker is done, or after this much quiet. Before
	// that, when it is half sure, it says so (EagerEndOfTurn), which gives a model a head start.
	if (model.endsWith('/flux')) return { ...audio, eager_eot_threshold: '0.5', eot_threshold: '0.7', eot_timeout_ms: '3000' };
	return { ...audio, interim_results: 'true', smart_format: 'true', punctuate: 'true', endpointing: '800', utterance_end_ms: '1500', vad_events: 'true' };
}

/**
 * `GET /api/tables/voice/listen` as a WebSocket, from the site's own pages, for the signed-in
 * owner only (`owner` is the Worker's own check of the passkey session). Answers with the
 * model's socket, so audio goes up and transcripts come down without passing through any code here.
 */
export async function voiceListen(request: Request, env: VoiceEnv, owner: () => Promise<boolean>): Promise<Response> {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return refuse(426, 'Voice notes listen over a WebSocket.');
	if (!sameOrigin(request)) return refuse(403, 'Forbidden');
	if (!(await owner().catch(() => false))) return refuse(403, 'Only the owner can dictate here.');
	if (!env.AI) return refuse(503, 'No speech model here.');
	const asked = Number(new URL(request.url).searchParams.get('rate'));
	const rate = Number.isFinite(asked) && asked >= 8000 && asked <= 48000 ? Math.round(asked) : 16000;
	const model = env.VOICE_MODEL || VOICE_MODEL;
	// Known words could be the model's key terms, but Flux on Workers AI opened and then closed the socket at the first words when
	// given `keyterm` (Casey's preview, 2026-11-28), so they are sent only where `VOICE_KEYTERMS` says to try again. The text model gets them either way.
	const terms = env.VOICE_KEYTERMS === 'on' ? cleanWords(new URL(request.url).searchParams.getAll('term')).slice(0, VOICE_TERMS_MAX) : [];
	const open = async (input: Record<string, string | string[]>) => {
		const answer = await env.AI!.run(model, input, { websocket: true });
		return answer instanceof Response && answer.status < 400 ? answer : undefined;
	};
	try {
		const options = listenOptions(model, rate);
		const answer = (terms.length ? await open({ ...options, keyterm: terms }).catch((error) => {
			console.error(JSON.stringify({ event: 'voice_terms_refused', model, error: String((error as Error)?.message ?? error).slice(0, 200) }));
			return undefined;
		}) : undefined) ?? (await open(options));
		return answer ?? refuse(502, 'The speech model didn’t open.');
	} catch (error) {
		console.error(JSON.stringify({ event: 'voice_listen_failed', model, error: String((error as Error)?.message ?? error).slice(0, 200) }));
		return refuse(502, 'The speech model didn’t open.');
	}
}

/** The fast model a voice note prefers: an answer in under half a second is what makes a spoken command feel heard (Casey chose it, 2026-11-28). */
export const VOICE_FAST_MODEL = 'cerebras:qwen-3.8-27b';

/** The model that answers: `VOICE_TEXT_MODEL` if it can answer here, else the fast one, else the chat's own, else any provider with a key. */
function textModel(env: VoiceEnv) {
	const chat = chatModels(env);
	const keyed = (provider: string) => !!env[CHAT_PROVIDERS.find((one) => one.id === provider)?.secret ?? 'INFERENCE_COOP_API_KEY'];
	const refs = [chat.resolve(env.VOICE_TEXT_MODEL), chat.resolve(VOICE_FAST_MODEL), chat.model, chat.resolve(chat.options[0]?.key)];
	const ref = refs.find((one) => one && keyed(one.provider));
	const model = ref && chat.models.getModel(ref.provider, ref.id);
	return model ? { models: chat.models, model } : undefined;
}

export const canRefine = (env: VoiceEnv) => !!textModel(env);

/** A finished block, corrected and placed by a model; `null` when no model can answer here. Throws when one fails. */
export async function refineSpeech(env: VoiceEnv, request: VoiceRefineRequest, signal?: AbortSignal): Promise<VoiceRefineAnswer | null> {
	const found = textModel(env);
	if (!found) return null;
	// The model is shown short ids (`b1`…) in place of the canvas's long random ones, and its answer is read back into them.
	const brief = shortIds(request);
	const { system, user } = refinePrompt(brief.request);
	const began = Date.now();
	const ask = async () => {
		const reply = await found.models.completeSimple(
			found.model,
			{ systemPrompt: system, messages: [{ role: 'user', content: user, timestamp: Date.now() }] },
			// The passage comes back whole, so the answer is about as long as the passage; `low` keeps a thinking model brief.
			{ maxTokens: 2000, reasoning: 'low', signal: signal ?? AbortSignal.timeout(20_000) }
		);
		if (reply.stopReason === 'error' || reply.stopReason === 'aborted') throw new Error(reply.errorMessage || 'The model stopped with an error');
		return reply;
	};
	const said = (one: Awaited<ReturnType<typeof ask>>) => one.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
	let reply = await ask();
	// An answer that can't be read (cut off at its limit, or not JSON) is asked for once more: a fast model's slip is rarely repeated.
	const retried = !readable(said(reply));
	if (retried) reply = await ask();
	const text = said(reply);
	const used = reply.usage as { input?: number; output?: number; cacheRead?: number; cost?: { total?: number } } | undefined;
	const input = (used?.input ?? 0) + (used?.cacheRead ?? 0), output = used?.output ?? 0;
	// pi-ai prices an answer from the provider's rates; where it has none, the model's own listed rates do.
	const rates = found.model.cost as { input?: number; output?: number } | undefined;
	const usd = used?.cost?.total ?? (input * (rates?.input ?? 0) + output * (rates?.output ?? 0)) / 1_000_000;
	const answer = brief.back(parseRefine(text, brief.request));
	// One line per answer (`voice_refine`): what was heard, what came back, how long it took.
	console.log(JSON.stringify({ event: 'voice_refine', ...refineLog(request, text, answer, { ms: Date.now() - began, model: `${found.model.provider}:${found.model.id}`, input, output }), ...(retried ? { retried: true } : {}) }));
	return { ...answer, usage: { provider: found.model.provider, model: found.model.id, input, output, usd, speech: env.VOICE_MODEL || VOICE_MODEL } };
}
