<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Switch from './Switch.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Switch',
		component: Switch,
		args: { checked: false },
		tags: ['!autodocs']
	});
</script>

<Story asChild name="Off">
	<Switch>Keep text in sync</Switch>
</Story>

<Story asChild name="On">
	<Switch checked>Keep text in sync</Switch>
</Story>

<Story asChild name="DisabledOff">
	<Switch disabled>Keep text in sync</Switch>
</Story>

<Story asChild name="DisabledOn">
	<Switch checked disabled>Keep text in sync</Switch>
</Story>
