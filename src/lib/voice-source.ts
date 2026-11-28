/**
 * Where a voice note's words come from, in the browser. A source listens until it is stopped and
 * reports `VoiceEvent`s (`src/lib/voice-notes.ts`). Two are built in:
 *
 * - `workerSource`: the microphone as 16-bit PCM over a WebSocket to the site's Worker, which
 *   passes it to a Workers AI speech model. Works the same in every browser, and the model marks
 *   pauses itself.
 * - `browserSource`: the browser's own dictation (`SpeechRecognition`), for where the Worker has
 *   no speech model (a local run, the tables demo). Pauses are timed here.
 *
 * `listen` tries them in order and settles on the first that starts.
 */
import { VOICE_LISTEN_PATH, VOICE_PAUSE_MS, VOICE_REFINE_PATH, sttEvents, type VoiceEvent, type VoiceRefineAnswer, type VoiceRefineRequest } from './voice-notes';

export interface VoiceListener {
	onevent(event: VoiceEvent): void;
	/** How loud the microphone is, 0 to 1, a few times a second. */
	onlevel?(level: number): void;
	/** The source stopped by itself (the connection dropped, permission was taken away). */
	onend(reason?: string): void;
}

export interface VoiceSource {
	/** `worker` or `browser`, for the status line. */
	name: string;
	/** Starts listening; resolves with the way to stop once words can arrive, rejects when it can't start. */
	start(listener: VoiceListener): Promise<() => void>;
}

/** Why listening couldn't start, in words for the person. */
export class VoiceError extends Error {}

const micDenied = (error: unknown) => ['NotAllowedError', 'SecurityError'].includes((error as { name?: string })?.name ?? '');

/* Raw audio from the microphone, cut into 80 ms pieces of 16-bit PCM off the main thread. */
const TAP = `
class VoiceTap extends AudioWorkletProcessor {
	constructor(options) {
		super();
		this.samples = new Int16Array(options.processorOptions.size);
		this.filled = 0;
	}
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (!channel) return true;
		for (let index = 0; index < channel.length; index++) {
			const sample = Math.max(-1, Math.min(1, channel[index]));
			this.samples[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
			if (this.filled === this.samples.length) {
				const copy = this.samples.slice();
				this.port.postMessage(copy.buffer, [copy.buffer]);
				this.filled = 0;
			}
		}
		return true;
	}
}
registerProcessor('voice-tap', VoiceTap);
`;

/** How loud a piece of audio is: its root mean square, scaled so ordinary speech reads around a half. */
export function loudness(samples: Int16Array): number {
	if (!samples.length) return 0;
	let sum = 0;
	for (let index = 0; index < samples.length; index++) sum += (samples[index] / 0x8000) ** 2;
	return Math.min(1, Math.sqrt(sum / samples.length) * 6);
}

export function workerSource(path = VOICE_LISTEN_PATH): VoiceSource {
	return {
		name: 'worker',
		async start(listener) {
			if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') throw new VoiceError('This browser can’t share its microphone here.');
			// The socket first: without a speech model behind it there is no reason to ask for the microphone.
			const context = new AudioContext({ sampleRate: 16000 });
			const address = new URL(`${path}?rate=${context.sampleRate}`, location.href);
			address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
			const socket = new WebSocket(address);
			socket.binaryType = 'arraybuffer';
			let stream: MediaStream | undefined;
			let stopped = false;
			const stop = () => {
				if (stopped) return;
				stopped = true;
				stream?.getTracks().forEach((track) => track.stop());
				void context.close().catch(() => {});
				if (socket.readyState <= WebSocket.OPEN) socket.close(1000);
			};
			try {
				await new Promise<void>((resolve, reject) => {
					socket.onopen = () => resolve();
					socket.onerror = socket.onclose = () => reject(new VoiceError('The speech model isn’t reachable here.'));
				});
				stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
				const module = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
				await context.audioWorklet.addModule(module).finally(() => URL.revokeObjectURL(module));
				await context.resume();
				const tap = new AudioWorkletNode(context, 'voice-tap', { numberOfInputs: 1, numberOfOutputs: 0, processorOptions: { size: Math.round(context.sampleRate * 0.08) } });
				tap.port.onmessage = (message: MessageEvent<ArrayBuffer>) => {
					if (socket.readyState === WebSocket.OPEN) socket.send(message.data);
					listener.onlevel?.(loudness(new Int16Array(message.data)));
				};
				context.createMediaStreamSource(stream).connect(tap);
			} catch (error) {
				stop();
				if (micDenied(error)) throw new VoiceError('The microphone is blocked for this site. Allow it in the browser’s site settings.');
				throw error instanceof VoiceError ? error : new VoiceError('The microphone couldn’t be started.');
			}
			socket.onmessage = (message) => {
				if (typeof message.data !== 'string') return;
				let parsed: unknown;
				try { parsed = JSON.parse(message.data); } catch { return; }
				for (const event of sttEvents(parsed)) listener.onevent(event);
			};
			socket.onerror = null;
			socket.onclose = () => {
				if (stopped) return;
				stop();
				listener.onend('The connection to the speech model closed.');
			};
			stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (!stopped) { stop(); listener.onend('The microphone stopped.'); } });
			return stop;
		}
	};
}

/* The browser's own dictation. The types aren't in TypeScript's DOM library. */
interface Recognition {
	continuous: boolean; interimResults: boolean; lang: string;
	onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	onstart: (() => void) | null;
	start(): void; stop(): void; abort(): void;
}

const recognitionClass = () => (typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition)) as (new () => Recognition) | undefined;

export function browserSource(pause = VOICE_PAUSE_MS): VoiceSource {
	return {
		name: 'browser',
		start(listener) {
			const Recognizer = recognitionClass();
			if (!Recognizer) return Promise.reject(new VoiceError('This browser has no dictation of its own, and the speech model isn’t reachable here.'));
			return new Promise((resolve, reject) => {
				const recognition = new Recognizer();
				recognition.continuous = true;
				recognition.interimResults = true;
				recognition.lang = navigator.language || 'en-US';
				let stopped = false, started = false;
				let quiet: ReturnType<typeof setTimeout> | undefined;
				const stop = () => { stopped = true; clearTimeout(quiet); recognition.abort(); };
				recognition.onstart = () => { if (!started) { started = true; resolve(stop); } };
				recognition.onresult = (event) => {
					let hearing = '';
					for (let index = event.resultIndex; index < event.results.length; index++) {
						const result = event.results[index];
						if (result.isFinal) listener.onevent({ type: 'final', text: result[0].transcript });
						else hearing += result[0].transcript;
					}
					listener.onevent({ type: 'partial', text: hearing });
					// Nothing more for a while is a pause: the block is done.
					clearTimeout(quiet);
					quiet = setTimeout(() => listener.onevent({ type: 'break' }), pause);
				};
				recognition.onerror = (event) => {
					if (event.error === 'no-speech' || event.error === 'aborted') return;
					const reason = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'The microphone is blocked for this site. Allow it in the browser’s site settings.' : 'Dictation stopped.';
					stopped = true;
					clearTimeout(quiet);
					if (started) listener.onend(reason);
					else reject(new VoiceError(reason));
				};
				// Browsers end a session after a silence; listening carries on until it is switched off.
				recognition.onend = () => { if (!stopped) try { recognition.start(); } catch { listener.onend('Dictation stopped.'); } };
				try { recognition.start(); } catch { reject(new VoiceError('Dictation couldn’t be started.')); }
			});
		}
	};
}

/** Starts the first source that can; the last one's reason is the error when none can. */
export async function listen(sources: VoiceSource[], listener: VoiceListener): Promise<{ name: string; stop: () => void }> {
	let failure: unknown = new VoiceError('There is nothing to listen with here.');
	for (const source of sources) {
		try {
			return { name: source.name, stop: await source.start(listener) };
		} catch (error) {
			failure = error;
			// A blocked microphone is the answer, whichever source asks.
			if (error instanceof VoiceError && /blocked/.test(error.message)) break;
		}
	}
	throw failure instanceof VoiceError ? failure : new VoiceError('Listening couldn’t be started.');
}

/**
 * Asks the site's model about a finished passage (`POST /api/tables/voice`: corrected, and for a
 * table placed). `csrf` is the owner's session token, however the page comes by it. Resolves
 * `null` where no model is set up; throws when one couldn't be asked.
 */
export function voiceRefiner(csrf: () => string | Promise<string>, path = VOICE_REFINE_PATH) {
	return async (request: VoiceRefineRequest): Promise<VoiceRefineAnswer | null> => {
		const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': await csrf() }, body: JSON.stringify(request) });
		if (response.status === 503) return null;
		if (!response.ok) throw new Error(`Voice refine answered ${response.status}`);
		return (await response.json()) as VoiceRefineAnswer;
	};
}

/** The signed-in owner's session token, asked for once, for pages that don't already hold it. */
let token: Promise<string> | undefined;
export function ownerCsrf(): Promise<string> {
	token ??= fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' })
		.then(async (response) => (response.ok ? ((await response.json()) as { csrf?: string }).csrf ?? '' : ''))
		.catch(() => '');
	// A miss (signed out, offline) is asked again next time.
	void token.then((found) => { if (!found) token = undefined; });
	return token;
}
