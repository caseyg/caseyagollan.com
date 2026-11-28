/**
 * Dictating into a message box, such as the chat's: switched on, what is heard is written after
 * whatever the box already holds, as the words arrive. At a pause the passage is finished: with
 * `correct`, a model fixes what was misheard; with `send`, the message is sent, and listening
 * carries on for the next one, so a conversation can be had by talking. Both choices are kept in
 * this browser. Listening itself is `VoiceListening`, shared with voice notes on tables; the box,
 * the sources and the model are handed in, so Storybook and the tests run it with scripted ones.
 */
import { blockText, hear, type SpokenBlock, type VoiceEvent, type VoiceRefineAnswer, type VoiceRefineRequest } from './voice-notes';
import { VoiceListening, keepChoices, keptChoices } from './voice-listening.svelte';
import type { VoiceSource } from './voice-source';

export interface DictationOptions {
	/** The ways to listen, best first. */
	sources: () => VoiceSource[];
	/** The box's words now, and a way to change them. */
	read: () => string;
	write: (text: string) => void;
	/** Sends what the box holds; resolves whether it went (and so whether the box was emptied). */
	send?: () => boolean | Promise<boolean>;
	/** Asks a model to correct a finished passage; resolves `null` when none can be asked. */
	refine?: (request: VoiceRefineRequest) => Promise<VoiceRefineAnswer | null>;
	/** Where the choices are remembered; left out, they last as long as the page. */
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
	/** The key they are remembered under. */
	key?: string;
}

/** A passage after what the box already held: a space between, unless the box ends a line. */
export function afterText(before: string, passage: string): string {
	if (!before.trim()) return passage;
	return !passage ? before : /\s$/.test(before) ? `${before}${passage}` : `${before} ${passage}`;
}

export class VoiceDictation extends VoiceListening {
	/** A finished passage is with the model, being corrected. */
	tidying = $state(false);
	#correct = $state(true);
	#send = $state(true);

	#options: DictationOptions;
	#key: string;
	#block: SpokenBlock = { settled: '', partial: '' };
	/** What the box held before the passage being spoken. */
	#before = '';
	/** The rest of a passage whose beginning was sent by hand is not written again. */
	#skipping = false;
	/** Finished passages are corrected and sent one at a time, in the order they were spoken. */
	#settling: Promise<void> = Promise.resolve();

	constructor(options: DictationOptions) {
		super(options.sources);
		this.#options = options;
		this.#key = options.key ?? 'chat-voice';
		const kept = keptChoices(options.storage, this.#key);
		this.#correct = kept.correct ?? this.#correct;
		this.#send = kept.send ?? this.#send;
	}

	/** A model fixes what was misheard in each finished passage. */
	get correct() { return this.#correct; }
	set correct(value: boolean) { this.#correct = value; this.#keep(); }
	/** A pause sends the message. Off, the words wait in the box to be sent by hand. */
	get send() { return this.#send; }
	set send(value: boolean) { this.#send = value; this.#keep(); }

	#keep() {
		keepChoices(this.#options.storage, this.#key, { correct: this.#correct, send: this.#send });
	}

	get #speaking() { return !!blockText(this.#block); }

	protected begin() {
		this.#block = { settled: '', partial: '' };
		this.#skipping = false;
	}

	/** The box was sent or emptied by hand: what is being said now belongs to the message that went. */
	cleared() {
		if (this.#speaking && this.listening) this.#skipping = true;
		this.#block = { settled: '', partial: '' };
	}

	protected heard(event: VoiceEvent, stopping: boolean) {
		if (this.#skipping) {
			if (event.type === 'break') this.#skipping = false;
			return;
		}
		// The first words of a passage go after whatever the box holds by then, typed or spoken.
		if (!this.#speaking) this.#before = this.#options.read();
		const { block, done } = hear(this.#block, event);
		this.#block = block;
		const text = blockText(block);
		if (text && event.type !== 'break') this.#options.write(afterText(this.#before, text));
		if (!done) return;
		const passage = { before: this.#before, text };
		this.#block = { settled: '', partial: '' };
		// Switching the microphone off is not a pause that sends: the words stay to be read over.
		const how = { correct: this.#correct, send: this.#send && !stopping };
		this.#settling = this.#settling.then(() => this.#finish(passage, how)).catch((error) => console.error('Dictated passage failed:', error));
	}

	/** A finished passage: corrected if that is wanted, then sent if a pause sends. */
	async #finish(passage: { before: string; text: string }, how: { correct: boolean; send: boolean }) {
		const { read, write, refine, send } = this.#options;
		if (how.correct && refine) {
			this.tidying = true;
			try {
				const answer = await refine({ text: passage.text, correct: true, connect: false, ...(passage.before.trim() ? { before: passage.before } : {}) });
				if (!answer) this.notice = 'No model is set up here to correct the text, so it stays as heard.';
				const heard = afterText(passage.before, passage.text), now = read();
				// Only where the box still reads as it was heard; words said or typed since are kept after it.
				if (answer?.text && answer.text !== passage.text && now.startsWith(heard)) {
					const fixed = afterText(passage.before, answer.text);
					write(`${fixed}${now.slice(heard.length)}`);
					if (this.#speaking && this.#before.startsWith(heard)) this.#before = `${fixed}${this.#before.slice(heard.length)}`;
				}
			} catch {
				this.notice = 'The text couldn’t be corrected just now, so it stays as heard.';
			} finally {
				this.tidying = false;
			}
		}
		// Talking again already: this passage goes with the next pause.
		if (!how.send || !send || this.#speaking || !read().trim()) return;
		if (await send()) this.#block = { settled: '', partial: '' };
	}

	/** Resolves once every finished passage has been corrected and sent. */
	settled() { return this.#settling; }
}
