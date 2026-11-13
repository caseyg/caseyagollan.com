<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Toggle from './Toggle.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Toggle',
		component: Toggle,
		args: { checked: false },
		tags: ['!autodocs']
	});
</script>

<Story asChild name="Off">
	<Toggle>Keep text in sync</Toggle>
</Story>

<Story asChild name="On">
	<Toggle checked>Keep text in sync</Toggle>
</Story>

<Story asChild name="DisabledOff">
	<Toggle disabled>Keep text in sync</Toggle>
</Story>

<Story asChild name="DisabledOn">
	<Toggle checked disabled>Keep text in sync</Toggle>
</Story>
