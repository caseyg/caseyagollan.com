import type { VoiceRefineAnswer, VoiceRefineRequest } from '$lib/voice-notes';
import type { VoiceSource } from '$lib/voice-source';

/** What a story's voice note "hears": each passage arrives a word at a time, then a pause. */
export const SPOKEN = [
	'so tables are canvases um where I lay things out',
	'a voice note should just write what I say',
	'and every pause starts a new block',
	'the layout could follow the argument like a tree'
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

/** A stand-in for the model: tidies the stories' passages, and says each follows the one before, the last branching from the first. */
export async function scriptedRefine(request: VoiceRefineRequest): Promise<VoiceRefineAnswer> {
	await new Promise((resolve) => setTimeout(resolve, 250));
	const tidy = request.text.replace(/\b(um|uh)\s+/g, '').replace(/^so\s+/, '');
	const text = request.correct ? `${tidy.charAt(0).toUpperCase()}${tidy.slice(1)}.`.replace('canvases where', 'canvases, where') : request.text;
	const spoken = (request.items ?? []).filter((item) => SPOKEN.some((passage) => item.text.toLowerCase().includes(passage.toLowerCase().split(' ').slice(-3).join(' '))));
	const follows = !request.connect ? undefined : request.text.includes('layout') ? spoken[0]?.id ?? null : spoken[spoken.length - 1]?.id ?? null;
	return { text, ...(follows !== undefined ? { follows } : {}) };
}
