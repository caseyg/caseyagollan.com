/**
 * A voice note being taken on a table: switched on, it writes what is heard into a text block as
 * the words arrive, closes the block at a pause and starts the next below it. Two choices, kept
 * in this browser, say what happens to a finished block: `correct` has a model fix what was
 * misheard, and `arrange` joins it by an arrow to the block it follows and sets the note out as
 * a tree. A third, `commands`, hears a request to change the table ("connect these two with an
 * arrow") and carries it out instead of writing it down. Sources (`voice-source.ts`), the canvas (`VoiceCanvas`) and the model are handed in, so
 * Storybook and the tests run the same session with scripted ones.
 */
import { addText, spendLines, usageUsd, blockText, describeOps, hear, quickCommand, type QuickCommand, noUsage, readUsage, type VoiceUsage, type SpokenBlock, type VoiceEvent, type VoiceRefineAnswer, type VoiceRefineRequest } from './voice-notes';
import { VoiceError, listen, type VoiceSource } from './voice-source';
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
/** Listening that hears nothing for this long switches itself off. */
const IDLE_MS = 3 * 60_000;

export class VoiceNotes {
	status = $state<'off' | 'starting' | 'listening'>('off');
	/** Why listening stopped or couldn't start, or that a model couldn't be asked. */
	notice = $state('');
	/** How loud the microphone is, 0 to 1. */
	level = $state(0);
	/** Which source is listening. */
	via = $state('');
	/** What the last spoken command did, in a few words; a new object each time, so saying the same twice shows twice. */
	did = $state<{ text: string } | undefined>();
	#correct = $state(true);
	#arrange = $state(false);
	#commands = $state(true);
	#meter = $state(false);
	/** What voice notes have used since this page opened, and this calendar month in this browser. */
	usage = $state<VoiceUsage>(noUsage());
	month = $state<VoiceUsage>(noUsage());
	#clock: ReturnType<typeof setInterval> | undefined;
	#counted = 0;
	/** Blocks that were wholly a command, and so taken away. */
	#gone = new Set<string>();

	#options: VoiceOptions;
	#stop: (() => void) | undefined;
	#block: SpokenBlock = { settled: '', partial: '' };
	/** The block being written, the one before it, and every block of this note, by id. */
	#writing: string | undefined;
	#last: { id: string; text: string } | undefined;
	#session: string[] = [];
	/** Finished blocks are placed one at a time, in the order they were spoken. */
	#settling: Promise<void> = Promise.resolve();
	#idle: ReturnType<typeof setTimeout> | undefined;
	#run = 0;

	constructor(options: VoiceOptions) {
		this.#options = options;
		try {
			const kept = JSON.parse(options.storage?.getItem(KEY) ?? 'null') as { correct?: unknown; arrange?: unknown; commands?: unknown; meter?: unknown } | null;
			if (typeof kept?.correct === 'boolean') this.#correct = kept.correct;
			if (typeof kept?.arrange === 'boolean') this.#arrange = kept.arrange;
			if (typeof kept?.commands === 'boolean') this.#commands = kept.commands;
			if (typeof kept?.meter === 'boolean') this.#meter = kept.meter;
			const spent = JSON.parse(options.storage?.getItem(USAGE_KEY) ?? 'null') as { month?: unknown; usage?: unknown } | null;
			if (spent?.month === thisMonth()) this.month = readUsage(spent.usage);
		} catch { /* nothing kept */ }
	}

	get listening() { return this.status !== 'off'; }
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
		try { this.#options.storage?.setItem(KEY, JSON.stringify({ correct: this.#correct, arrange: this.#arrange, commands: this.#commands, meter: this.#meter })); } catch { /* private window */ }
	}

	toggle = () => (this.listening ? this.stop() : void this.start());

	async start() {
		if (this.listening) return;
		const run = ++this.#run;
		this.status = 'starting';
		this.notice = '';
		this.#block = { settled: '', partial: '' };
		this.#writing = this.#last = undefined;
		this.#session = [];
		this.#gone.clear();
		this.did = undefined;
		try {
			const { name, stop } = await listen(this.#options.sources(), {
				onevent: (event) => { if (run === this.#run) this.#heard(event); },
				onlevel: (level) => { if (run === this.#run) this.level = level; },
				onend: (reason) => { if (run === this.#run) this.stop(reason); }
			});
			// Switched off while the microphone was being asked for.
			if (run !== this.#run) return stop();
			this.#stop = stop;
			this.via = name;
			this.status = 'listening';
			this.#counted = Date.now();
			this.#clock = setInterval(() => this.#tick(), 5000);
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
		clearInterval(this.#clock);
		if (this.status === 'listening') this.#tick();
		this.#counted = 0;
		this.#stop?.();
		this.#stop = undefined;
		this.status = 'off';
		this.level = 0;
		if (reason) this.notice = reason;
		// What was being said when it stopped is kept as a block.
		this.#heard({ type: 'break' });
	}

	#rest() {
		clearTimeout(this.#idle);
		this.#idle = setTimeout(() => this.stop('Switched off after three quiet minutes.'), IDLE_MS);
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

	#heard(event: VoiceEvent) {
		const canvas = this.#options.canvas();
		if (!canvas) return;
		if (this.listening) this.#rest();
		const { block, done } = hear(this.#block, event);
		this.#block = block;
		const text = blockText(block);
		if (text && event.type !== 'break') {
			this.#writing = canvas.write(this.#writing, text, this.#last?.id);
			this.#quick(canvas, text, this.#writing, false);
		}
		if (!done) return;
		const id = this.#writing ?? canvas.write(undefined, text, this.#last?.id);
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
		this.#settling = this.#settling.then(() => this.#finish(canvas, { id, text }, before, how)).catch((error) => console.error('Voice note block failed:', error));
	}

	/** A finished block: corrected and placed by a model if either is wanted, any command in it carried out, then set in its place. */
	async #finish(canvas: VoiceCanvas, block: { id: string; text: string }, before: { id: string; text: string } | undefined, how: { correct: boolean; arrange: boolean; commands: boolean; session: string[] }) {
		const session = how.session.filter((id) => !this.#gone.has(id));
		const others = how.arrange ? canvas.texts().filter((item) => item.id !== block.id) : [];
		let answer: VoiceRefineAnswer | null = null;
		if (this.#options.refine && (how.correct || how.commands || others.length)) {
			try {
				const table = how.commands ? { ...(await canvas.read()), spoken: session } : undefined;
				answer = await this.#options.refine({ text: block.text, correct: how.correct, connect: others.length > 0, ...(before ? { before: before.text } : {}), ...(others.length ? { items: others } : {}), ...(table ? { commands: true, id: block.id, table } : {}) });
				if (answer?.usage) { const used = answer.usage; this.#spend((usage) => addText(usage, used)); }
				if (!answer && how.correct) this.notice = 'No model is set up here to correct the text, so it stays as heard.';
			} catch {
				if (how.correct) this.notice = 'The text couldn’t be corrected just now, so it stays as heard.';
			}
		}
		const ops = answer?.ops ?? [];
		// A passage that was all command leaves no block; the block spoken before it is the last again.
		if (ops.length && !answer!.text) {
			canvas.remove(block.id);
			this.#gone.add(block.id);
			this.#session = this.#session.filter((id) => id !== block.id);
			if (this.#last?.id === block.id) this.#last = before;
		} else {
			if ((how.correct || ops.length) && answer && answer.text !== block.text && canvas.rewrite(block.id, answer.text, block.text) && this.#last?.id === block.id) this.#last = { id: block.id, text: answer.text };
			// With no opinion from a model, a block follows the one spoken before it.
			const follows = answer && answer.follows !== undefined ? answer.follows : before && !this.#gone.has(before.id) ? before.id : undefined;
			await canvas.settle(block.id, { follows, arrange: how.arrange, session });
		}
		if (!ops.length) return;
		const done = await canvas.run(ops);
		this.did = { text: done.length ? describeOps(done) : 'That couldn’t be done here.' };
	}

	/** Resolves once every finished block has been corrected and placed. */
	settled() { return this.#settling; }
}
