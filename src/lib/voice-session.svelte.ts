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
import { RECENT_MAX, cleanWords, learnedWords, recentLine, endsSession, addText, spendLines, usageUsd, blockText, describeOps, hear, quickCommand, type QuickCommand, noUsage, readUsage, type VoiceUsage, type VoiceLogEntry, type SpokenBlock, type VoiceEvent, type VoiceRefineAnswer, type VoiceRefineRequest } from './voice-notes';
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
	/** Takes a line for the log (when the note starts, each passage with its timings and what was made of it, when it ends). */
	log?: (entry: VoiceLogEntry) => void;
	/** Where the choices are remembered; left out, they last as long as the page. */
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const KEY = 'tables-voice';
/** The calendar month's usage, kept in this browser: `{ month, usage }`. */
const USAGE_KEY = 'tables-voice-usage';
/** The known words, kept in this browser. */
const WORDS_KEY = 'tables-voice-words';
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
	/** Words the speaker uses, spelled their way: told to the model with every passage. Kept in this browser. */
	#words = $state<string[]>([]);
	/** Finished blocks a model is still considering: corrected, or taken as a command. */
	thinking = $state(0);
	/** A head start: the question asked of a model when the speaker had probably finished, kept if they had. */
	#early: { id: string; text: string; answer: Promise<VoiceRefineAnswer | null>; took: { ms: number; failed: string; anchor?: string; blank?: string } } | undefined;
	#clock: ReturnType<typeof setInterval> | undefined;
	/** Which voice note this is, so one that has ended doesn't select its blocks during the next. */
	#note = 0;
	/** For the log: this voice note's name, when it began, its passages counted, and the times of the one being spoken. */
	#trace = '';
	#began = 0;
	#passages = 0;
	#spoke = 0;
	#likely = 0;
	#tally = { likely: 0, early: 0, notes: 0, commands: 0 };
	#counted = 0;
	/** A sticky a command made with nothing in it: what is said next is written there. */
	#blank: string | undefined;
	/** Stickies this voice note made or filled: part of its map, though they aren't text blocks. */
	#made: string[] = [];
	/** What was said and done lately in this voice note, a line each: what "it" and "the other direction" are read against. */
	#recent: string[] = [];
	/** Where the voice note is working: the item it keeps selected, so the next thing said has somewhere to go. */
	#focus: string | undefined;
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
		try { this.#words = cleanWords(JSON.parse(options.storage?.getItem(WORDS_KEY) ?? '[]')); } catch { /* nothing kept */ }
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

	/** The known words, as the control lists them; setting them keeps them. */
	get words() { return this.#words; }
	set words(value: string[]) {
		this.#words = cleanWords(value);
		try { this.#options.storage?.setItem(WORDS_KEY, JSON.stringify(this.#words)); } catch { /* private window */ }
	}

	/** A hand edit of something on the table: a word it corrected is a word to know (`learnedWords`). Returns what was learnt. */
	learn(before: string, after: string): string[] {
		const learnt = learnedWords(before, after, this.#words);
		if (learnt.length) this.words = [...learnt, ...this.#words];
		return learnt;
	}

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
		this.#blank = undefined;
		this.#made = [];
		this.#recent = [];
		this.#focus = undefined;
		this.#note++;
		this.#trace = Math.random().toString(36).slice(2, 10);
		this.#began = Date.now();
		this.#passages = this.#spoke = this.#likely = 0;
		this.#tally = { likely: 0, early: 0, notes: 0, commands: 0 };
	}

	/** A line for the log, named for this voice note and timed from its start. */
	#log(kind: string, entry: VoiceLogEntry = {}) {
		try { this.#options.log?.({ kind, note: this.#trace, at_ms: Date.now() - this.#began, ...entry }); } catch { /* the log is never worth an error */ }
	}

	protected odd(what: string) { this.#log('odd', { what }); }

	async start() {
		await super.start();
		if (this.status !== 'listening') return;
		// Time listened is counted every few seconds, to whichever source is listening.
		clearInterval(this.#clock);
		this.#log('start', { via: this.via, correct: this.#correct, arrange: this.#arrange, commands: this.#commands, page: typeof location === 'undefined' ? '' : location.pathname });
		this.#counted = Date.now();
		this.#clock = setInterval(() => this.#tick(), 5000);
	}

	stop(reason = '') {
		if (!this.listening) return;
		clearInterval(this.#clock);
		if (this.status === 'listening') this.#tick();
		this.#counted = 0;
		const starting = this.status === 'starting';
		// Switching off keeps what was being said as a block (`heard` is told of a last pause).
		super.stop(reason);
		// Once everything has settled, what this voice note added is selected, to be moved or removed as one.
		const canvas = this.#options.canvas(), note = this.#note;
		void this.#settling.then(() => {
			const kept = this.#session.filter((id) => !this.#gone.has(id));
			if (note === this.#note) this.#log('stop', { reason: reason || (starting ? 'switched off while starting' : 'switched off'), notice: this.notice, passages: this.#passages, kept: kept.length, likely: this.#tally.likely, early_used: this.#tally.early, notes: this.#tally.notes, commands: this.#tally.commands });
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
		// A selection asked for aloud is the speaker pointing, even at what the voice note had selected itself.
		if (found) this.#focus = undefined;
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
			if (fresh) { canvas.pending(this.#writing, true); this.#passages++; this.#spoke = Date.now(); this.#likely = 0; }
			if (this.#quick(canvas, text, this.#writing, false) && event.type === 'likely') return;
		}
		// Probably finished: the model is asked now, and the answer is waiting if the pause confirms it.
		if (event.type === 'likely' && text && this.#writing && this.#early?.text !== text) {
			const id = this.#writing, how = { correct: this.#correct, arrange: this.#arrange, commands: this.#commands, session: [...this.#session, id] };
			const took = { ms: 0, failed: '' };
			this.#likely = Date.now();
			this.#tally.likely++;
			this.#early = { id, text, took, answer: this.#ask(canvas, { id, text }, this.#last, how, took) };
		}
		if (!done) return;
		const id = this.#writing ?? canvas.write(undefined, text, this.#last?.id);
		// For the log: which passage this is, how long it was spoken for, and how long before the pause the model was asked.
		const paused = Date.now();
		const passage: VoiceLogEntry = { n: this.#passages, heard: text, spoke_ms: this.#spoke ? paused - this.#spoke : 0, ...(this.#likely ? { head_start_ms: paused - this.#likely } : {}), ...(event.type === 'break' && !this.listening ? { cut_off: true } : {}) };
		// "That's all": the voice note is over, and those words aren't part of it.
		if (this.#commands && endsSession(text)) {
			canvas.remove(id);
			this.#writing = undefined;
			this.#block = { settled: '', partial: '' };
			this.#log('passage', { ...passage, was: 'that’s all' });
			return this.stop();
		}
		// All of it was "select…" or "focus on…", and something answered: done already, nothing to write down or ask.
		const quick = this.#quick(canvas, text, id, true);
		if (quick) {
			canvas.remove(id);
			this.#writing = undefined;
			this.#block = { settled: '', partial: '' };
			this.did = { text: `${quick.kind === 'focus' ? 'Went to' : 'Selected'} ${quick.ids.length === 1 ? '1 block' : `${quick.ids.length} blocks`}` };
			this.#log('passage', { ...passage, was: `${quick.kind}, without a model`, did: this.did.text });
			return;
		}
		const before = this.#last;
		this.#last = { id, text };
		this.#session.push(id);
		this.#writing = undefined;
		this.#block = { settled: '', partial: '' };
		const how = { correct: this.#correct, arrange: this.#arrange, commands: this.#commands, session: [...this.#session] };
		// The model is asked at once, not after the blocks before this one have settled; answers are still applied in the order spoken.
		const early = this.#early?.id === id && this.#early.text === text ? this.#early : undefined;
		this.#early = undefined;
		if (early) this.#tally.early++;
		const took = early?.took ?? { ms: 0, failed: '' };
		const answer = early?.answer ?? this.#ask(canvas, { id, text }, before, how, took);
		if (this.#options.refine && (how.correct || how.commands || how.arrange)) {
			this.thinking++;
			canvas.pending(id, true);
		}
		this.#settling = this.#settling
			.then(() => this.#finish(canvas, { id, text }, before, how, answer, took))
			.then((made) => {
				if (String(made.was).includes('command')) this.#tally.commands++;
				else this.#tally.notes += 1 + (typeof made.more === 'number' ? made.more : 0);
				this.#log('passage', { ...passage, trace: `${this.#trace}.${passage.n}`, early: !!early, ask_ms: took.ms, ...(took.failed ? { ask_failed: took.failed } : {}), wait_ms: Date.now() - paused, ...made });
			})
			.catch((error) => {
				console.error('Voice note block failed:', error);
				this.#log('passage', { ...passage, was: 'failed', error: String((error as Error)?.message ?? error) });
			})
			.finally(() => {
				canvas.pending(id, false);
				if (this.#options.refine && (how.correct || how.commands || how.arrange)) this.thinking = Math.max(0, this.thinking - 1);
			});
	}

	/** Asks a model about a block: what it should read, what it follows, and whether part of it was a command. Never throws. */
	async #ask(canvas: VoiceCanvas, block: { id: string; text: string }, before: { id: string; text: string } | undefined, how: { correct: boolean; arrange: boolean; commands: boolean; session: string[] }, took: { ms: number; failed: string; anchor?: string; blank?: string } = { ms: 0, failed: '' }): Promise<VoiceRefineAnswer | null> {
		const session = how.session.filter((id) => !this.#gone.has(id));
		const others = how.arrange ? canvas.texts().filter((item) => item.id !== block.id) : [];
		if (!this.#options.refine || !(how.correct || how.commands || others.length)) return null;
		const began = Date.now();
		try {
			const seen = how.commands || how.arrange ? await canvas.read() : undefined;
			const table = how.commands && seen ? { ...seen, spoken: session } : undefined;
			// The one thing selected is where the speaker is pointing: an empty sticky is waiting for these words, anything else is the topic they branch from.
			const chosen = seen?.selected.filter((id) => id !== block.id) ?? [];
			const pointed = chosen.length === 1 ? seen!.items.find((item) => item.id === chosen[0]) : undefined;
			// A selection the voice note made itself only shows where it is working: the model is told, and decides. One made by hand is the speaker pointing.
			const working = pointed && pointed.id === this.#focus ? pointed.id : undefined;
			if (!working) this.#focus = undefined;
			if (pointed && !pointed.text && (pointed.type === 'note' || pointed.type === 'geo')) took.blank = pointed.id;
			else if (pointed && !working && pointed.type !== 'arrow' && pointed.type !== 'frame') took.anchor = pointed.id;
			if (table && working) table.selected = table.selected.filter((id) => id !== working);
			const answer = await this.#options.refine({ text: block.text, correct: how.correct, ...(how.correct ? { split: true } : {}), connect: others.length > 0, ...(before ? { before: before.text } : {}), ...(others.length ? { items: others } : {}), ...(table ? { commands: true, id: block.id, table } : {}), trace: `${this.#trace}.${this.#passages}`, ...(this.#recent.length ? { recent: this.#recent.slice(-RECENT_MAX) } : {}), ...(working ? { focus: working } : {}), ...(this.#words.length ? { words: this.#words } : {}) });
			took.ms = Date.now() - began;
			if (!answer) took.failed = 'no model';
			if (answer?.usage) { const used = answer.usage; this.#spend((usage) => addText(usage, used)); }
			if (!answer && how.correct) this.notice = 'No model is set up here to correct the text, so it stays as heard.';
			return answer;
		} catch (error) {
			took.ms = Date.now() - began;
			took.failed = String((error as Error)?.message ?? error).slice(0, 200);
			if (how.correct) this.notice = 'The text couldn’t be corrected just now, so it stays as heard.';
			return null;
		}
	}

	/** A finished block, once a model has answered: corrected, any command in it carried out, then set in its place. */
	async #finish(canvas: VoiceCanvas, block: { id: string; text: string }, before: { id: string; text: string } | undefined, how: { correct: boolean; arrange: boolean; commands: boolean; session: string[] }, asked: Promise<VoiceRefineAnswer | null>, took: { ms: number; failed: string; anchor?: string; blank?: string } = { ms: 0, failed: '' }): Promise<VoiceLogEntry> {
		const answer = await asked;
		// What was made of the passage, for the log.
		const made: VoiceLogEntry = { was: 'note, as heard', text: block.text };
		const session = how.session.filter((id) => !this.#gone.has(id));
		const ops = answer?.ops ?? [];
		// A passage that was all command leaves no block; the block spoken before it is the last again.
		if (answer?.none) {
			// Nothing was made of it: not a note, and not a command that could be done. It isn't written down.
			canvas.remove(block.id);
			this.#gone.add(block.id);
			this.#session = this.#session.filter((id) => id !== block.id);
			if (this.#last?.id === block.id) this.#last = before;
			this.#recent.push(recentLine(block.text, []));
			this.did = { text: 'Nothing done' };
			return { was: 'nothing: no note, and no command that could be done', text: '' };
		}
		if (ops.length && !answer!.text) {
			canvas.remove(block.id);
			this.#gone.add(block.id);
			this.#session = this.#session.filter((id) => id !== block.id);
			if (this.#last?.id === block.id) this.#last = before;
			made.was = 'command';
			made.text = '';
		} else if (!ops.length && (took.blank ?? this.#blank) && (await this.#fill(canvas, took.blank ?? this.#blank!, block, [answer?.text || block.text, ...(answer?.more ?? [])].join('\n'), how))) {
			// An empty sticky was waiting for these words.
			made.was = 'note, into the empty sticky';
			made.text = answer?.text || block.text;
		} else {
			const rewritten = !!answer && (answer.text === block.text || ((how.correct || ops.length > 0) && canvas.rewrite(block.id, answer.text, block.text)));
			if (rewritten && this.#last?.id === block.id) this.#last = { id: block.id, text: answer!.text };
			made.was = ops.length ? 'note and command' : !answer ? 'note, as heard (no answer)' : rewritten ? 'note' : 'note, as heard (the block had changed)';
			if (rewritten) made.text = answer!.text;
			if (rewritten && answer?.more?.length) made.more = answer.more.length;
			// With no opinion from a model, a block follows the one spoken before it.
			// What is selected is the topic being spoken about; otherwise the model says, and failing that the block before.
			const follows = how.arrange && took.anchor && took.anchor !== block.id ? took.anchor : answer && answer.follows !== undefined ? answer.follows : before && !this.#gone.has(before.id) ? before.id : undefined;
			if (how.arrange && took.anchor && follows === took.anchor) made.branch_of = 'the selection';
			await canvas.settle(block.id, { follows, arrange: how.arrange, session: [...session, ...this.#made] });
			if (!ops.length) {
				this.#recent.push(recentLine(block.text, [], { id: block.id, follows: how.arrange ? follows : undefined }));
				// The topic stays where the voice note is working; a note that began a new subject is the topic now.
				await this.#work(canvas, how.arrange && follows ? follows : block.id);
			}
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
		if (!ops.length) return made;
		const done = await canvas.run(ops);
		this.#recent.push(recentLine(block.text, done));
		made.ops_asked = ops.length;
		made.ops_done = done.length;
		// A sticky made with nothing in it waits for the next thing said; any sticky made is part of this note's map.
		for (const op of done) {
			if (op.op !== 'add_note' || !op.made) continue;
			this.#made.push(op.made);
			this.#blank = op.text ? this.#blank : op.made;
		}
		if (how.arrange && this.#made.length) await canvas.map(this.#made.at(-1)!, [...this.#session, ...this.#made, ...ops.flatMap((op) => (op.op === 'connect' ? op.links.map((link) => link.from) : []))]);
		// Blocks of this voice note that a command took away ("scratch that") are no longer part of it.
		const left = new Map(canvas.texts(500).map((item) => [item.id, item.text]));
		for (const id of this.#session) if (!left.has(id)) this.#gone.add(id);
		this.#session = this.#session.filter((id) => !this.#gone.has(id));
		if (this.#last && this.#gone.has(this.#last.id)) {
			const id = this.#session.at(-1);
			this.#last = id ? { id, text: left.get(id) ?? '' } : undefined;
		}
		this.did = { text: done.length ? describeOps(done) : 'That couldn’t be done here.' };
		made.did = this.did.text;
		// What a command made or changed last is where the voice note is working now.
		const touched = done.flatMap((op) => (op.op === 'add_note' || op.op === 'add_shape' ? (op.made ? [op.made] : []) : op.op === 'edit' ? op.edits.map((edit) => edit.id) : [])).at(-1);
		if (touched) await this.#work(canvas, touched);
		return made;
	}

	/** Writes a passage into an empty sticky that was waiting for it, in place of a block of its own. False when the sticky is gone or no longer empty. */
	async #fill(canvas: VoiceCanvas, sticky: string, block: { id: string; text: string }, words: string, how: { arrange: boolean }): Promise<boolean> {
		this.#blank = undefined;
		const there = (await canvas.read()).items.find((item) => item.id === sticky);
		if (!there || there.text) return false;
		const done = await canvas.run([{ op: 'edit', edits: [{ id: sticky, text: words }] }]);
		if (!done.length) return false;
		canvas.remove(block.id);
		this.#gone.add(block.id);
		this.#session = this.#session.filter((id) => id !== block.id);
		if (!this.#made.includes(sticky)) this.#made.push(sticky);
		// The sticky is now the last thing said, for what follows to hang from.
		if (this.#last?.id === block.id) this.#last = { id: sticky, text: words };
		if (how.arrange) await canvas.map(sticky, [...this.#session, ...this.#made]);
		this.#recent.push(recentLine(block.text, [{ op: 'edit', edits: [{ id: sticky, text: words }] }]));
		await this.#work(canvas, sticky);
		return true;
	}

	/**
	 * Shows where the voice note is working by selecting it, so the speaker sees what the next thing
	 * said will be about. A selection made by hand meanwhile is left alone: that is the speaker pointing.
	 */
	async #work(canvas: VoiceCanvas, id: string) {
		if (!this.listening) return;
		const chosen = (await canvas.read()).selected;
		if (chosen.length && !(chosen.length === 1 && chosen[0] === this.#focus)) return;
		this.#focus = id;
		canvas.show([id], false);
	}

	/** Resolves once every finished block has been corrected and placed. */
	settled() { return this.#settling; }
}
