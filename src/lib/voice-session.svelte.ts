/**
 * A voice note being taken on a table: switched on, it writes what is heard into a text block as
 * the words arrive, closes the block at a pause and starts the next below it. Two choices, kept
 * in this browser, say what happens to a finished block: `correct` has a model fix what was
 * misheard, and `arrange` joins it by an arrow to the block it follows and sets the note out as
 * a tree. A third, `commands`, hears a request to change the table ("connect these two with an
 * arrow") and carries it out instead of writing it down. Listening itself (the microphone, its
 * sources, switching on and off) is `VoiceListening`, shared with the chat's dictation. Sources
 * (`voice-source.ts`), the canvas (`VoiceCanvas`) and the model are handed in, so Storybook and
 * the tests run the same session with scripted ones.
 */
import { endsSession, addText, spendLines, usageUsd, blockText, describeOps, hear, quickCommand, type QuickCommand, noUsage, readUsage, type VoiceUsage, type SpokenBlock, type VoiceEvent, type VoiceRefineAnswer, type VoiceRefineRequest } from './voice-notes';
import { VoiceListening, keepChoices, keptChoices } from './voice-listening.svelte';
import type { VoiceSource } from './voice-source';
import type { VoiceCanvas } from './components/tables/canvas/textBlocks';

export interface VoiceOptions {
	/** The open table's canvas; undefined until it has loaded. */
	canvas: () => VoiceCanvas | undefined;
	/** The ways to listen, best first. */
	sources: () => VoiceSource[];
	/** Asks a model about a finished block; resolves `null` when none can be asked. */
	refine?: (request: VoiceRefineRequest) => Promise<VoiceRefineAnswer | null>;
	/** Where the choices are remembered; left out, they last as long as the page. */
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const KEY = 'tables-voice';
/** The calendar month's usage, kept in this browser: `{ month, usage }`. */
const USAGE_KEY = 'tables-voice-usage';
const thisMonth = () => new Date().toISOString().slice(0, 7);

export class VoiceNotes extends VoiceListening {
	/** What the last spoken command did, in a few words; a new object each time, so saying the same twice shows twice. */
	did = $state<{ text: string } | undefined>();
	#correct = $state(true);
	#arrange = $state(false);
	#commands = $state(true);
	#meter = $state(false);
	/** What voice notes have used since this page opened, and this calendar month in this browser. */
	usage = $state<VoiceUsage>(noUsage());
	month = $state<VoiceUsage>(noUsage());
	/** Finished blocks a model is still considering: corrected, or taken as a command. */
	thinking = $state(0);
	/** A head start: the question asked of a model when the speaker had probably finished, kept if they had. */
	#early: { id: string; text: string; answer: Promise<VoiceRefineAnswer | null> } | undefined;
	#clock: ReturnType<typeof setInterval> | undefined;
	/** Which voice note this is, so one that has ended doesn't select its blocks during the next. */
	#note = 0;
	#counted = 0;
	/** Blocks that were wholly a command, and so taken away. */
	#gone = new Set<string>();

	#options: VoiceOptions;
	#block: SpokenBlock = { settled: '', partial: '' };
	/** The block being written, the one before it, and every block of this note, by id. */
	#writing: string | undefined;
	#last: { id: string; text: string } | undefined;
	#session: string[] = [];
	/** Finished blocks are placed one at a time, in the order they were spoken. */
	#settling: Promise<void> = Promise.resolve();

	constructor(options: VoiceOptions) {
		super(options.sources);
		this.#options = options;
		const kept = keptChoices(options.storage, KEY);
		this.#correct = kept.correct ?? this.#correct;
		this.#arrange = kept.arrange ?? this.#arrange;
		this.#commands = kept.commands ?? this.#commands;
		this.#meter = kept.meter ?? this.#meter;
		try {
			const spent = JSON.parse(options.storage?.getItem(USAGE_KEY) ?? 'null') as { month?: unknown; usage?: unknown } | null;
			if (spent?.month === thisMonth()) this.month = readUsage(spent.usage);
		} catch { /* nothing kept */ }
	}

	get correct() { return this.#correct; }
	set correct(value: boolean) { this.#correct = value; this.#keep(); }
	get arrange() { return this.#arrange; }
	set arrange(value: boolean) { this.#arrange = value; this.#keep(); }
	get commands() { return this.#commands; }
	set commands(value: boolean) { this.#commands = value; this.#keep(); }
	/** Whether the running cost shows beside the microphone. */
	get meter() { return this.#meter; }
	set meter(value: boolean) { this.#meter = value; this.#keep(); }

	/** The usage as the control shows it. */
	get usageView() { return { lines: spendLines(this.usage), usd: usageUsd(this.usage), monthUsd: usageUsd(this.month), shown: this.#meter }; }

	/** Adds to both tallies and keeps the month's. */
	#spend(add: (usage: VoiceUsage) => VoiceUsage) {
		this.usage = add(this.usage);
		this.month = add(this.month);
		try { this.#options.storage?.setItem(USAGE_KEY, JSON.stringify({ month: thisMonth(), usage: this.month })); } catch { /* private window */ }
	}

	/** Counts the time listened since it was last counted, to whichever source is listening. */
	#tick() {
		const now = Date.now(), seconds = this.#counted ? (now - this.#counted) / 1000 : 0;
		this.#counted = now;
		if (seconds <= 0) return;
		const paid = this.via === 'worker';
		// A source that is neither the Worker's model nor the browser's dictation (a story's script) uses nothing.
		if (!paid && this.via !== 'browser') return;
		this.#spend((usage) => (paid ? { ...usage, speech: { ...usage.speech, seconds: usage.speech.seconds + seconds } } : { ...usage, browser: usage.browser + seconds }));
	}

	#keep() {
		keepChoices(this.#options.storage, KEY, { correct: this.#correct, arrange: this.#arrange, commands: this.#commands, meter: this.#meter });
	}

	protected begin() {
		this.#block = { settled: '', partial: '' };
		this.#writing = this.#last = undefined;
		this.#session = [];
		this.#gone.clear();
		this.did = undefined;
		this.#early = undefined;
		this.#note++;
	}

	async start() {
		await super.start();
		if (this.status !== 'listening') return;
		// Time listened is counted every few seconds, to whichever source is listening.
		clearInterval(this.#clock);
		this.#counted = Date.now();
		this.#clock = setInterval(() => this.#tick(), 5000);
	}

	stop(reason = '') {
		if (!this.listening) return;
		clearInterval(this.#clock);
		if (this.status === 'listening') this.#tick();
		this.#counted = 0;
		// Switching off keeps what was being said as a block (`heard` is told of a last pause).
		super.stop(reason);
		// Once everything has settled, what this voice note added is selected, to be moved or removed as one.
		const canvas = this.#options.canvas(), note = this.#note;
		void this.#settling.then(() => {
			const kept = this.#session.filter((id) => !this.#gone.has(id));
			if (!canvas || note !== this.#note || this.listening || !kept.length) return;
			canvas.show(kept, false);
			this.did = { text: `Added ${kept.length === 1 ? '1 note' : `${kept.length} notes`}` };
		});
	}

	/**
	 * "Select the pricing note" and "focus on the last one" are acted on as they are heard, with no
	 * model: the selection follows the words while they arrive. Returns what was shown.
	 */
	#quick(canvas: VoiceCanvas, text: string, own: string | undefined, settled: boolean): QuickCommand | null {
		if (!this.#commands) return null;
		const found = quickCommand(text, canvas.texts(200).filter((item) => item.id !== own), this.#session);
		// Selecting follows every word; zooming waits for the passage to end, so the view moves once.
		if (found) canvas.show(found.ids, settled && found.kind === 'focus');
		return found;
	}

	protected heard(event: VoiceEvent) {
		const canvas = this.#options.canvas();
		if (!canvas) return;
		const { block, done } = hear(this.#block, event);
		this.#block = block;
		const text = blockText(block);
		if (text && event.type !== 'break') {
			const fresh = !this.#writing;
			this.#writing = canvas.write(this.#writing, text, this.#last?.id);
			// Words still arriving are drawn faint: they are a draft until the pause settles them.
			if (fresh) canvas.pending(this.#writing, true);
			this.#quick(canvas, text, this.#writing, false);
		}
		// Probably finished: the model is asked now, and the answer is waiting if the pause confirms it.
		if (event.type === 'likely' && text && this.#writing && this.#early?.text !== text) {
			const id = this.#writing, how = { correct: this.#correct, arrange: this.#arrange, commands: this.#commands, session: [...this.#session, id] };
			this.#early = { id, text, answer: this.#ask(canvas, { id, text }, this.#last, how) };
		}
		if (!done) return;
		const id = this.#writing ?? canvas.write(undefined, text, this.#last?.id);
		// "That's all": the voice note is over, and those words aren't part of it.
		if (this.#commands && endsSession(text)) {
			canvas.remove(id);
			this.#writing = undefined;
			this.#block = { settled: '', partial: '' };
			return this.stop();
		}
		// All of it was "select…" or "focus on…", and something answered: done already, nothing to write down or ask.
		const quick = this.#quick(canvas, text, id, true);
		if (quick) {
			canvas.remove(id);
			this.#writing = undefined;
			this.#block = { settled: '', partial: '' };
			this.did = { text: `${quick.kind === 'focus' ? 'Went to' : 'Selected'} ${quick.ids.length === 1 ? '1 block' : `${quick.ids.length} blocks`}` };
			return;
		}
		const before = this.#last;
		this.#last = { id, text };
		this.#session.push(id);
		this.#writing = undefined;
		this.#block = { settled: '', partial: '' };
		const how = { correct: this.#correct, arrange: this.#arrange, commands: this.#commands, session: [...this.#session] };
		// The model is asked at once, not after the blocks before this one have settled; answers are still applied in the order spoken.
		const early = this.#early?.id === id && this.#early.text === text ? this.#early.answer : undefined;
		this.#early = undefined;
		const answer = early ?? this.#ask(canvas, { id, text }, before, how);
		if (this.#options.refine && (how.correct || how.commands || how.arrange)) {
			this.thinking++;
			canvas.pending(id, true);
		}
		this.#settling = this.#settling
			.then(() => this.#finish(canvas, { id, text }, before, how, answer))
			.catch((error) => console.error('Voice note block failed:', error))
			.finally(() => {
				canvas.pending(id, false);
				if (this.#options.refine && (how.correct || how.commands || how.arrange)) this.thinking = Math.max(0, this.thinking - 1);
			});
	}

	/** Asks a model about a block: what it should read, what it follows, and whether part of it was a command. Never throws. */
	async #ask(canvas: VoiceCanvas, block: { id: string; text: string }, before: { id: string; text: string } | undefined, how: { correct: boolean; arrange: boolean; commands: boolean; session: string[] }): Promise<VoiceRefineAnswer | null> {
		const session = how.session.filter((id) => !this.#gone.has(id));
		const others = how.arrange ? canvas.texts().filter((item) => item.id !== block.id) : [];
		if (!this.#options.refine || !(how.correct || how.commands || others.length)) return null;
		try {
			const table = how.commands ? { ...(await canvas.read()), spoken: session } : undefined;
			const answer = await this.#options.refine({ text: block.text, correct: how.correct, ...(how.correct ? { split: true } : {}), connect: others.length > 0, ...(before ? { before: before.text } : {}), ...(others.length ? { items: others } : {}), ...(table ? { commands: true, id: block.id, table } : {}) });
			if (answer?.usage) { const used = answer.usage; this.#spend((usage) => addText(usage, used)); }
			if (!answer && how.correct) this.notice = 'No model is set up here to correct the text, so it stays as heard.';
			return answer;
		} catch {
			if (how.correct) this.notice = 'The text couldn’t be corrected just now, so it stays as heard.';
			return null;
		}
	}

	/** A finished block, once a model has answered: corrected, any command in it carried out, then set in its place. */
	async #finish(canvas: VoiceCanvas, block: { id: string; text: string }, before: { id: string; text: string } | undefined, how: { correct: boolean; arrange: boolean; commands: boolean; session: string[] }, asked: Promise<VoiceRefineAnswer | null>) {
		const answer = await asked;
		const session = how.session.filter((id) => !this.#gone.has(id));
		const ops = answer?.ops ?? [];
		// A passage that was all command leaves no block; the block spoken before it is the last again.
		if (ops.length && !answer!.text) {
			canvas.remove(block.id);
			this.#gone.add(block.id);
			this.#session = this.#session.filter((id) => id !== block.id);
			if (this.#last?.id === block.id) this.#last = before;
		} else {
			const rewritten = !!answer && (answer.text === block.text || ((how.correct || ops.length > 0) && canvas.rewrite(block.id, answer.text, block.text)));
			if (rewritten && this.#last?.id === block.id) this.#last = { id: block.id, text: answer!.text };
			// With no opinion from a model, a block follows the one spoken before it.
			const follows = answer && answer.follows !== undefined ? answer.follows : before && !this.#gone.has(before.id) ? before.id : undefined;
			await canvas.settle(block.id, { follows, arrange: how.arrange, session });
			// A ramble that held several things: a block for each, one under the other.
			let above = block.id;
			for (const words of rewritten ? answer?.more ?? [] : []) {
				const id = canvas.write(undefined, words, above);
				this.#session.splice(this.#session.indexOf(above) + 1, 0, id);
				if (this.#last?.id === above) this.#last = { id, text: words };
				await canvas.settle(id, { follows: above, arrange: how.arrange, session: this.#session.filter((one) => !this.#gone.has(one)) });
				above = id;
			}
		}
		if (!ops.length) return;
		const done = await canvas.run(ops);
		// Blocks of this voice note that a command took away ("scratch that") are no longer part of it.
		const left = new Map(canvas.texts(500).map((item) => [item.id, item.text]));
		for (const id of this.#session) if (!left.has(id)) this.#gone.add(id);
		this.#session = this.#session.filter((id) => !this.#gone.has(id));
		if (this.#last && this.#gone.has(this.#last.id)) {
			const id = this.#session.at(-1);
			this.#last = id ? { id, text: left.get(id) ?? '' } : undefined;
		}
		this.did = { text: done.length ? describeOps(done) : 'That couldn’t be done here.' };
	}

	/** Resolves once every finished block has been corrected and placed. */
	settled() { return this.#settling; }
}
