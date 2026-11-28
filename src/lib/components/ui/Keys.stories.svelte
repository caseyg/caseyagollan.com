<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Keys from './Keys.svelte';

	const { Story } = defineMeta({ title: 'Primitives/Keys', component: Keys, tags: ['!autodocs'] });
</script>

<!-- One key. -->
<Story asChild name="One key">
	<Keys keys={['Tab']} />
</Story>

<!-- Keys pressed together stand side by side. -->
<Story asChild name="Together">
	<Keys keys={['⌥', '⇧', '→']} />
</Story>

<!-- Modifiers spelled out, as on a keyboard that prints them that way. -->
<Story asChild name="Spelled out">
	<Keys keys={['Ctrl', 'Shift', 'Z']} />
</Story>
