<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PictureReading } from '$lib/source-status';
	import PictureText from './PictureText.svelte';

	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 300));
	const cover = (isbn: string) => `/library/img/${isbn}.jpg`;
	const none: PictureReading = { total: 6912, read: 0, withWords: 0, failed: 0, asked: 0, usage: { pictures: 0, input: 0, output: 0 }, recent: [] };
	const tried: PictureReading = {
		total: 6912, read: 19, withWords: 11, failed: 1, asked: 0, usage: { pictures: 19, input: 24_700, output: 2_300 },
		recent: [
			{ url: cover('0822359383'), text: 'TWO CHEERS FOR ANARCHISM\nSix Easy Pieces on Autonomy, Dignity, and Meaningful Work and Play\nJames C. Scott', at: '2026-11-28T18:30:00Z', failed: false },
			{ url: cover('0262033658'), text: '', at: '2026-11-28T18:30:00Z', failed: false },
			{ url: cover('0000000000'), text: '', at: '2026-11-28T18:30:00Z', failed: true }
		]
	};
	const done: PictureReading = { ...tried, read: 6890, withWords: 3120, failed: 22, usage: { pictures: 6890, input: 8_950_000, output: 830_000 } };

	/** A pass that gets ten pictures further each time it is asked, as the real one does. */
	const live = () => {
		let read = 19, asked = 0;
		const now = (): PictureReading => ({ ...tried, read, withWords: Math.round(read * 0.45), asked, usage: { pictures: read, input: read * 1300, output: read * 120 } });
		return {
			load: async () => { if (asked > 0) { read += 10; asked = Math.max(asked - 10, 0); } return now(); },
			read: async (count: number) => { asked = count; return now(); }
		};
	};
	const running = live();

	const { Story } = defineMeta({ title: 'Site/PictureText', component: PictureText, parameters: { docs: { story: { height: '420px' } } } });
</script>

<!-- On /account under Connections, beneath Saved copies: nothing read yet, a trial of 20 offered first. -->
<Story name="Nothing read yet" args={{ load: later(none), read: later(none) }} />

<!-- After the trial: what it cost, what the rest would, and the words to judge the reading by. -->
<Story name="After a trial" args={{ load: later(tried), read: later(tried) }} />

<!-- Press Read all: the bar fills as the pictures are read, ten at a time. -->
<Story name="Reading" args={{ load: running.load, read: running.read }} />

<Story name="All read" args={{ load: later(done), read: later(done) }} />

<!-- The dev server, where there is no Worker to hold the copy. -->
<Story name="Not available" args={{ load: later(null) }} />
