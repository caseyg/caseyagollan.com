import { describe, expect, test } from 'bun:test';
import { VoiceDictation, afterText } from '../src/lib/voice-dictation.svelte';
import type { VoiceEvent, VoiceRefineAnswer, VoiceRefineRequest } from '../src/lib/voice-notes';
import type { VoiceListener, VoiceSource } from '../src/lib/voice-source';

/** A message box, a microphone the test speaks through, and a model that answers when the test lets it. */
function setup(options: { kept?: Record<string, boolean>; refine?: (request: VoiceRefineRequest) => Promise<VoiceRefineAnswer | null>; send?: boolean } = {}) {
	const box = { text: '' };
	const sent: string[] = [];
	const stored: Record<string, string> = options.kept ? { 'chat-voice': JSON.stringify(options.kept) } : {};
	let listener: VoiceListener | undefined;
	const source: VoiceSource = { name: 'test', start: async (given) => { listener = given; return () => {}; } };
	const dictation = new VoiceDictation({
		sources: () => [source],
		read: () => box.text,
		write: (text) => (box.text = text),
		send: options.send === false ? undefined : () => { sent.push(box.text); box.text = ''; return true; },
		refine: options.refine,
		storage: { getItem: (key) => stored[key] ?? null, setItem: (key, value) => void (stored[key] = value) }
	});
	const say = (...events: VoiceEvent[]) => events.forEach((event) => listener!.onevent(event));
	const turn = (text: string) => say({ type: 'partial', text }, { type: 'final', text }, { type: 'break' });
	return { box, sent, stored, dictation, say, turn };
}

const tidy = async (request: VoiceRefineRequest) => ({ text: `${request.text.charAt(0).toUpperCase()}${request.text.slice(1)}.` });

describe('words after what the box holds', () => {
	test('a space between, none after a line break or into an empty box', () => {
		expect(afterText('', 'hello')).toBe('hello');
		expect(afterText('  ', 'hello')).toBe('hello');
		expect(afterText('Dear Casey,', 'hello')).toBe('Dear Casey, hello');
		expect(afterText('Dear Casey,\n', 'hello')).toBe('Dear Casey,\nhello');
		expect(afterText('typed', '')).toBe('typed');
	});
});

describe('dictating into a message box', () => {
	test('words arrive as they are said, and a pause sends them', async () => {
		const { box, sent, dictation, say } = setup();
		await dictation.start();
		expect(dictation.status).toBe('listening');
		say({ type: 'partial', text: 'which books' });
		expect(box.text).toBe('which books');
		say({ type: 'partial', text: 'which books are new' });
		expect(box.text).toBe('which books are new');
		say({ type: 'final', text: 'which books are new' }, { type: 'break' });
		await dictation.settled();
		expect(sent).toEqual(['which books are new']);
		expect(box.text).toBe('');
		// Listening carries on for the next message.
		expect(dictation.listening).toBe(true);
	});

	test('a passage is corrected before it goes', async () => {
		const { sent, dictation, turn } = setup({ refine: tidy });
		await dictation.start();
		turn('which books are new');
		await dictation.settled();
		expect(sent).toEqual(['Which books are new.']);
	});

	test('the model is asked only to correct, with what was typed before as context', async () => {
		const asked: VoiceRefineRequest[] = [];
		const { box, dictation, turn } = setup({ refine: async (request) => { asked.push(request); return { text: request.text }; } });
		box.text = 'About the library:';
		await dictation.start();
		turn('which books are new');
		await dictation.settled();
		expect(asked).toEqual([{ text: 'which books are new', correct: true, connect: false, before: 'About the library:' }]);
	});

	test('with sending off, passages gather in the box after what was typed', async () => {
		const { box, sent, dictation, turn } = setup({ kept: { send: false }, refine: tidy });
		box.text = 'A question:';
		await dictation.start();
		turn('which books are new');
		await dictation.settled();
		turn('and which are old');
		await dictation.settled();
		expect(sent).toEqual([]);
		expect(box.text).toBe('A question: Which books are new. And which are old.');
	});

	test('with correcting off, no model is asked', async () => {
		let asked = 0;
		const { sent, dictation, turn } = setup({ kept: { correct: false }, refine: async (request) => { asked++; return { text: request.text }; } });
		await dictation.start();
		turn('as heard');
		await dictation.settled();
		expect(asked).toBe(0);
		expect(sent).toEqual(['as heard']);
	});

	test('a model that fails, or is missing, leaves the words as heard and says so', async () => {
		const failing = setup({ refine: async () => { throw new Error('down'); } });
		await failing.dictation.start();
		failing.turn('as heard');
		await failing.dictation.settled();
		expect(failing.sent).toEqual(['as heard']);
		expect(failing.dictation.notice).toContain('couldn’t be corrected');

		const none = setup({ refine: async () => null });
		await none.dictation.start();
		none.turn('as heard');
		await none.dictation.settled();
		expect(none.sent).toEqual(['as heard']);
		expect(none.dictation.notice).toContain('No model');
	});

	test('talking on while a passage is corrected: both go together at the next pause, the first one corrected', async () => {
		let answer: (value: VoiceRefineAnswer) => void = () => {};
		let calls = 0;
		const refine = (request: VoiceRefineRequest) => (++calls === 1 ? new Promise<VoiceRefineAnswer>((resolve) => (answer = resolve)) : tidy(request));
		const { box, sent, dictation, say, turn } = setup({ refine });
		await dictation.start();
		turn('first thought');
		await Promise.resolve();
		say({ type: 'partial', text: 'second' });
		expect(box.text).toBe('first thought second');
		answer({ text: 'First thought.' });
		await dictation.settled();
		expect(sent).toEqual([]);
		expect(box.text).toBe('First thought. second');
		say({ type: 'partial', text: 'second thought' });
		expect(box.text).toBe('First thought. second thought');
		say({ type: 'final', text: 'second thought' }, { type: 'break' });
		await dictation.settled();
		expect(sent).toEqual(['First thought. Second thought.']);
	});

	test('a correction never overwrites words changed by hand meanwhile', async () => {
		let answer: (value: VoiceRefineAnswer) => void = () => {};
		const { box, dictation, turn } = setup({ kept: { send: false }, refine: () => new Promise((resolve) => (answer = resolve)) });
		await dictation.start();
		turn('first thought');
		await Promise.resolve();
		box.text = 'my own words';
		answer({ text: 'First thought.' });
		await dictation.settled();
		expect(box.text).toBe('my own words');
	});

	test('switching the microphone off keeps what was being said, and never sends', async () => {
		const { box, sent, dictation, say } = setup();
		await dictation.start();
		say({ type: 'partial', text: 'half a thought' });
		dictation.stop();
		await dictation.settled();
		expect(dictation.status).toBe('off');
		expect(sent).toEqual([]);
		expect(box.text).toBe('half a thought');
	});

	test('sent by hand mid-sentence: the rest of that passage is not written again', async () => {
		const { box, sent, dictation, say, turn } = setup();
		await dictation.start();
		say({ type: 'partial', text: 'send this now' });
		box.text = '';
		dictation.cleared();
		say({ type: 'partial', text: 'send this now please' }, { type: 'final', text: 'send this now please' }, { type: 'break' });
		await dictation.settled();
		expect(box.text).toBe('');
		expect(sent).toEqual([]);
		turn('a new message');
		await dictation.settled();
		expect(sent).toEqual(['a new message']);
	});

	test('a message that did not go stays in the box', async () => {
		const box = { text: '' };
		let listener: VoiceListener | undefined;
		const dictation = new VoiceDictation({ sources: () => [{ name: 'test', start: async (given) => { listener = given; return () => {}; } }], read: () => box.text, write: (text) => (box.text = text), send: () => false });
		await dictation.start();
		listener!.onevent({ type: 'final', text: 'while offline' });
		listener!.onevent({ type: 'break' });
		await dictation.settled();
		expect(box.text).toBe('while offline');
	});

	test('the choices are remembered', () => {
		const { stored, dictation } = setup();
		expect([dictation.send, dictation.correct]).toEqual([true, true]);
		dictation.send = false;
		expect(JSON.parse(stored['chat-voice'])).toEqual({ correct: true, send: false });
		expect(setup({ kept: { send: false, correct: false } }).dictation.correct).toBe(false);
	});

	test('a microphone that can’t start says why', async () => {
		const { VoiceError } = await import('../src/lib/voice-source');
		const dictation = new VoiceDictation({ sources: () => [{ name: 'blocked', start: () => Promise.reject(new VoiceError('The microphone is blocked for this site.')) }], read: () => '', write: () => {} });
		await dictation.start();
		expect(dictation.status).toBe('off');
		expect(dictation.notice).toBe('The microphone is blocked for this site.');
	});
});
