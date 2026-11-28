import type { VoiceOp, VoiceRefineAnswer, VoiceRefineRequest } from '$lib/voice-notes';
import type { VoiceSource } from '$lib/voice-source';

/** What a story's voice note "hears": each passage arrives a word at a time, then a pause. */
export const SPOKEN = [
	'so tables are canvases um where I lay things out',
	'a voice note should just write what I say',
	'and every pause starts a new block',
	'the layout could follow the argument like a tree'
];

/** A ramble: several things in one breath, one taken back, one changed, and the words that end it. */
export const RAMBLE = [
	'okay so for the workshop i need to book the room and um email the speakers and print the name tags',
	'actually scratch the name tags',
	'and the budget is due on thursday',
	'actually make that friday',
	'that\'s all'
];

/** Thinking aloud as a mind map: a topic, a sticky asked for and then filled, and two points made about the topic once it is selected. */
export const MINDMAP = [
	'planning the workshop',
	'add a sticky',
	'the venue needs a projector',
	'select planning the workshop',
	'we should invite the speakers early',
	'and print name tags'
];

/** What a chat story's dictation "hears": a message, then a follow-up. */
export const ASKED = [
	'so um which books about cooperatives are in the library',
	'and put the ones from this year on a table'
];

/** A voice note with requests in it: two thoughts, then things asked of the table. */
export const COMMANDS = [
	'create a markdown heading',
	'meeting notes',
	'testing one two three',
	'okay cool so this is a new block can you connect these two blocks with an arrow',
	'turn one two three into numbers',
	'draw a circle next to that and call it ideas',
	'make the first one blue',
	'add a new sticky connected by an arrow for work',
	'select the new block'
];

/** A source that speaks passages instead of listening, for stories and browser tests. */
export function scriptedSource(passages: string[] = SPOKEN, pace = 90): VoiceSource {
	return {
		name: 'script',
		async start(listener) {
			let stopped = false;
			void (async () => {
				const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
				for (const passage of passages) {
					const words = passage.split(' ');
					for (let count = 1; count <= words.length && !stopped; count++) {
						listener.onevent({ type: 'partial', text: words.slice(0, count).join(' ') });
						listener.onlevel?.(0.3 + 0.5 * Math.abs(Math.sin(count)));
						await wait(pace);
					}
					if (stopped) return;
					listener.onevent({ type: 'final', text: passage });
					listener.onevent({ type: 'break' });
					listener.onlevel?.(0.05);
					await wait(pace * 6);
				}
				if (!stopped) listener.onend();
			})();
			return () => { stopped = true; };
		}
	};
}

/** The stand-in's ear for the requests in `COMMANDS`: what each asks, as operations on the blocks spoken so far. */
function scriptedCommand(request: VoiceRefineRequest): { text: string; ops: VoiceOp[] } | undefined {
	const table = request.table;
	if (!request.commands || !table) return undefined;
	const heard = request.text.toLowerCase();
	const earlier = table.spoken.filter((id) => id !== request.id);
	const words = (id: string | undefined) => table.items.find((item) => item.id === id)?.text ?? '';
	const first = earlier[0], last = earlier[earlier.length - 1];
	// A heading asked for with no words: a stand-in, which the next thing said replaces.
	if (heard.includes('heading')) return { text: '', ops: [{ op: 'add_note', text: '# Heading', style: 'text' }] };
	if (heard.includes('scratch') && last) return { text: '', ops: [{ op: 'remove', ids: [last] }] };
	if (heard.includes('make that friday') && last) return { text: '', ops: [{ op: 'edit', edits: [{ id: last, text: words(last).replace(/thursday/i, 'Friday') }] }] };
	if (heard.includes('connect these two') && last && request.id) return { text: 'Okay, cool. So this is a new block.', ops: [{ op: 'connect', links: [{ from: last, to: request.id }] }] };
	if (heard.includes('into numbers') && first) return { text: '', ops: [{ op: 'edit', edits: [{ id: first, text: words(first).replace(/one,? two,? three/i, '1, 2, 3') }] }] };
	if (heard.includes('draw a circle') && last) return { text: '', ops: [{ op: 'add_shape', shape: 'ellipse', text: 'Ideas', right_of: last }] };
	if (heard.includes('add a sticky') && last) return { text: '', ops: [{ op: 'add_note', text: '', style: 'note', right_of: last, as: 'new1' }, { op: 'connect', links: [{ from: last, to: 'new1' }] }] };
	if (heard.includes('sticky') && last) return { text: '', ops: [{ op: 'add_note', text: 'Work', style: 'note', right_of: last, as: 'new1' }, { op: 'connect', links: [{ from: last, to: 'new1' }] }] };
	if (heard.includes('blue') && first) return { text: '', ops: [{ op: 'edit', edits: [{ id: first, color: 'blue' }] }] };
	return undefined;
}

/** A stand-in for the model: tidies the stories' passages, and says each follows the one before, the last branching from the first. */
export async function scriptedRefine(request: VoiceRefineRequest): Promise<VoiceRefineAnswer> {
	await new Promise((resolve) => setTimeout(resolve, 900));
	// As the Worker does, each answer says what it used, so the stories' usage counter has something to count.
	const usage = { provider: 'story', model: 'stand-in', input: 600 + request.text.length, output: 40, usd: 0.00008 };
	const command = scriptedCommand(request);
	if (command) return { ...command, usage };
	if (request.correct && request.text.includes('book the room')) return { text: 'Book the room.', more: ['Email the speakers.', 'Print the name tags.'], usage };
	const tidy = request.text.replace(/\b(um|uh)\s+/g, '').replace(/^(and|so)\s+/, '');
	const text = request.correct ? `${tidy.charAt(0).toUpperCase()}${tidy.slice(1)}.`.replace('canvases where', 'canvases, where') : request.text;
	const spoken = (request.items ?? []).filter((item) => SPOKEN.some((passage) => item.text.toLowerCase().includes(passage.toLowerCase().split(' ').slice(-3).join(' '))));
	const follows = !request.connect ? undefined : request.text.includes('layout') ? spoken[0]?.id ?? null : spoken[spoken.length - 1]?.id ?? null;
	return { text, ...(follows !== undefined ? { follows } : {}), usage };
}
