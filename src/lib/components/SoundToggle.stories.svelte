<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SoundToggle from './SoundToggle.svelte';

	const { Story } = defineMeta({ title: 'Site/SoundToggle', component: SoundToggle, tags: ['!autodocs'] });
</script>

<script lang="ts">
	import { play, setVolume, type PlayOptions, type SoundName } from 'cuelume';
	import { Button, Section } from '$lib/components/ui';
	import { SOUND_EMPHASIS, SOUND_VOLUME } from '$lib/sound.svelte';

	// Every cue the graphs and the library play, at the site's volume, to audition them together.
	const cues: { moment: string; name: SoundName; options?: PlayOptions }[] = [
		{ moment: 'Graph: focus a deeper topic', name: 'select', options: { direction: 'forward' } },
		{ moment: 'Graph: focus back toward Casey', name: 'select', options: { direction: 'back' } },
		{ moment: 'Graph: open a link node', name: 'navigate' },
		{ moment: 'Graph: drop a dragged node', name: 'tap' },
		{ moment: 'Graph: insight arrives', name: 'ready' },
		{ moment: 'Graph: insight fails', name: 'error' },
		{ moment: 'Library: open a book', name: 'open' },
		{ moment: 'Library: switch to another book', name: 'select' },
		{ moment: 'Library: next book (→, swipe)', name: 'navigate', options: { direction: 'forward' } },
		{ moment: 'Library: previous book (←, swipe)', name: 'navigate', options: { direction: 'back' } },
		{ moment: 'Library: close a book', name: 'close' },
		{ moment: 'Library graph: filter by subject', name: 'toggle' },
		{ moment: 'Library graph: clear the filter', name: 'toggle', options: { direction: 'back' } },
		{ moment: 'Shelves: filter by subject', name: 'navigate', options: { direction: 'forward' } },
		{ moment: 'Shelves: clear the filter', name: 'navigate', options: { direction: 'back' } },
		{ moment: 'Library: Graph → Shelves', name: 'navigate', options: { direction: 'forward' } },
		{ moment: 'Library: Shelves → Graph', name: 'navigate', options: { direction: 'back' } },
		{ moment: 'Shelves: change the sort', name: 'navigate', options: { direction: 'forward' } }
	];

	function audition(name: SoundName, options?: PlayOptions) {
		setVolume(SOUND_VOLUME);
		play(name, { emphasis: SOUND_EMPHASIS, ...options });
	}
</script>

<!-- What the visitor sees, floating bottom left: on, unless they turned it off or ask their system for reduced motion. -->
<Story asChild name="Live">
	<SoundToggle />
</Story>

<Story asChild name="On">
	<SoundToggle enabled floating={false} />
</Story>

<Story asChild name="Off">
	<SoundToggle enabled={false} floating={false} />
</Story>

<Story asChild name="Cues">
	<Section title="Cues on the graphs and in the library">
		{#each cues as { moment, name, options }}
			<p>
				<Button variant="quiet" size="sm" onclick={() => audition(name, options)}>▶ {moment}</Button>
				<code>{name}{options?.direction ? `, ${options.direction}` : ''}</code>
			</p>
		{/each}
	</Section>
</Story>
