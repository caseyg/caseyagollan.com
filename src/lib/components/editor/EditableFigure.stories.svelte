<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import EditableFigure from './EditableFigure.svelte';
	import { Prose } from '$lib/components/ui';

	const { Story } = defineMeta({ title: 'Composer/EditableFigure', component: EditableFigure, tags: ['!autodocs'] });
</script>

<script lang="ts">
	import type { Figure } from '$lib/markdown-figure';

	const image = '/author-avatar.webp';
	let right = $state<Figure>({ src: image, alt: "Casey's avatar", caption: 'A right-aligned figure sits beside the text and stacks on phones.', align: 'right' });
	let selected = $state<Figure>({ src: image, alt: "Casey's avatar", caption: 'The <a href="/library/">recently acquired shelves</a>.', align: 'narrow' });
	let full = $state<Figure>({ src: image, alt: '', caption: '', align: 'full' });
	const update = (figure: Figure, changes: Partial<Figure>) => Object.assign(figure, changes);
</script>

{#snippet text()}
	<p>Figures float beside the paragraphs that follow them, the way they do on the post. Click the image to select it and change its placement or alt text, and click the caption to edit it in place.</p>
	<p>Captions keep their links, emphasis and code, and stay one line of HTML in the Markdown source.</p>
{/snippet}

<Story asChild name="Beside the text">
	<Prose><EditableFigure figure={right} onchange={changes => update(right, changes)} />{@render text()}</Prose>
</Story>

<Story asChild name="Selected">
	<Prose><p>&nbsp;</p><EditableFigure figure={selected} selected onchange={changes => update(selected, changes)} />{@render text()}</Prose>
</Story>

<Story asChild name="Full width without a caption">
	<Prose><p>&nbsp;</p><EditableFigure figure={full} selected onchange={changes => update(full, changes)} />{@render text()}</Prose>
</Story>
