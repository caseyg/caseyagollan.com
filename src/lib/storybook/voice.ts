import type { VoiceOp, VoiceRefineAnswer, VoiceRefineRequest } from '$lib/voice-notes';
import type { VoiceSource } from '$lib/voice-source';

/** What a story's voice note "hears": each passage arrives a word at a time, then a pause. */
export const SPOKEN = [
	'so tables are canvases um where I lay things out',
	'a voice note should just write what I say',
	'and every pause starts a new block',
	'the layout could follow the argument like a tree'
];

/** What a chat story's dictation "hears": a message, then a follow-up. */
export const ASKED = [
	'so um which books about cooperatives are in the library',
	'and put the ones from this year on a table'
];

/** A voice note with requests in it: two thoughts, then things asked of the table. */
export const COMMANDS = [
	'testing one two three',
	'okay cool so this is a new block can you connect these two blocks with an arrow',
	'turn one two three into numbers',
	'draw a circle next to that and call it ideas',
	'make the first one blue'
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
	if (heard.includes('connect these two') && last && request.id) return { text: 'Okay, cool. So this is a new block.', ops: [{ op: 'connect', links: [{ from: last, to: request.id }] }] };
	if (heard.includes('into numbers') && first) return { text: '', ops: [{ op: 'edit', edits: [{ id: first, text: words(first).replace(/one,? two,? three/i, '1, 2, 3') }] }] };
	if (heard.includes('draw a circle') && last) return { text: '', ops: [{ op: 'add_shape', shape: 'ellipse', text: 'Ideas', right_of: last }] };
	if (heard.includes('blue') && first) return { text: '', ops: [{ op: 'edit', edits: [{ id: first, color: 'blue' }] }] };
	return undefined;
}

/** A stand-in for the model: tidies the stories' passages, and says each follows the one before, the last branching from the first. */
export async function scriptedRefine(request: VoiceRefineRequest): Promise<VoiceRefineAnswer> {
	await new Promise((resolve) => setTimeout(resolve, 250));
	const command = scriptedCommand(request);
	if (command) return command;
	const tidy = request.text.replace(/\b(um|uh)\s+/g, '').replace(/^so\s+/, '');
	const text = request.correct ? `${tidy.charAt(0).toUpperCase()}${tidy.slice(1)}.`.replace('canvases where', 'canvases, where') : request.text;
	const spoken = (request.items ?? []).filter((item) => SPOKEN.some((passage) => item.text.toLowerCase().includes(passage.toLowerCase().split(' ').slice(-3).join(' '))));
	const follows = !request.connect ? undefined : request.text.includes('layout') ? spoken[0]?.id ?? null : spoken[spoken.length - 1]?.id ?? null;
	return { text, ...(follows !== undefined ? { follows } : {}) };
}
