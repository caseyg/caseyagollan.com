/**
 * Listening, wherever the words end up: a microphone that is switched on and off, the first source
 * that can hear (`voice-source.ts`), how loud it is, and why it stopped. What is done with the
 * words is the subclass's: a table writes them into text blocks (`voice-session.svelte.ts`), the
 * chat into its message box (`voice-dictation.svelte.ts`).
 */
import type { VoiceEvent } from './voice-notes';
import { VoiceError, listen, type VoiceSource } from './voice-source';

/** Listening that hears nothing for this long switches itself off. */
const IDLE_MS = 3 * 60_000;

/** Choices kept in the browser under one key, as JSON; anything that isn't a yes or no is left out. */
export function keptChoices(storage: Pick<Storage, 'getItem'> | undefined, key: string): Record<string, boolean> {
	try {
		const kept = JSON.parse(storage?.getItem(key) ?? 'null') as Record<string, unknown> | null;
		return Object.fromEntries(Object.entries(kept ?? {}).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
	} catch {
		return {};
	}
}

export function keepChoices(storage: Pick<Storage, 'setItem'> | undefined, key: string, choices: Record<string, boolean>) {
	try { storage?.setItem(key, JSON.stringify(choices)); } catch { /* private window */ }
}

export abstract class VoiceListening {
	status = $state<'off' | 'starting' | 'listening'>('off');
	/** Why listening stopped or couldn't start, or that a model couldn't be asked. */
	notice = $state('');
	/** How loud the microphone is, 0 to 1. */
	level = $state(0);
	/** Which source is listening. */
	via = $state('');

	#sources: () => VoiceSource[];
	#stop: (() => void) | undefined;
	#idle: ReturnType<typeof setTimeout> | undefined;
	#run = 0;

	/** `sources`: the ways to listen, best first. */
	constructor(sources: () => VoiceSource[]) {
		this.#sources = sources;
	}

	get listening() { return this.status !== 'off'; }

	toggle = () => (this.listening ? this.stop() : void this.start());

	/** Listening is about to start: forget the last time. */
	protected abstract begin(): void;
	/** Something was heard. `stopping`: this is the pause that switching off makes of whatever was being said. */
	protected abstract heard(event: VoiceEvent, stopping: boolean): void;

	async start() {
		if (this.listening) return;
		const run = ++this.#run;
		this.status = 'starting';
		this.notice = '';
		this.begin();
		try {
			const { name, stop } = await listen(this.#sources(), {
				onevent: (event) => {
					if (run !== this.#run) return;
					this.#rest();
					this.heard(event, false);
				},
				onlevel: (level) => { if (run === this.#run) this.level = level; },
				onend: (reason) => { if (run === this.#run) this.stop(reason); }
			});
			// Switched off while the microphone was being asked for.
			if (run !== this.#run) return stop();
			this.#stop = stop;
			this.via = name;
			this.status = 'listening';
			this.#rest();
		} catch (error) {
			if (run !== this.#run) return;
			this.status = 'off';
			this.notice = error instanceof VoiceError ? error.message : 'Listening couldn’t be started.';
		}
	}

	stop(reason = '') {
		if (!this.listening) return;
		this.#run++;
		clearTimeout(this.#idle);
		this.#stop?.();
		this.#stop = undefined;
		this.status = 'off';
		this.level = 0;
		if (reason) this.notice = reason;
		// What was being said when it stopped is kept.
		this.heard({ type: 'break' }, true);
	}

	#rest() {
		clearTimeout(this.#idle);
		this.#idle = setTimeout(() => this.stop('Switched off after three quiet minutes.'), IDLE_MS);
	}
}
