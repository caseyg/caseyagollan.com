<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProgressBar from './ProgressBar.svelte';

	const { Story } = defineMeta({ title: 'Primitives/ProgressBar', component: ProgressBar, parameters: { docs: { story: { height: '80px' } } } });
</script>

<!-- Work whose length is known: a thin bar that fills. -->
<Story name="Part way" args={{ value: 0.42, label: 'Copying Readwise' }} />

<Story name="Nearly done" args={{ value: 0.96, label: 'Copying Readwise' }} />

<!-- Paused, such as while a service asks the site to wait. -->
<Story name="Waiting" args={{ value: 0.42, waiting: true, label: 'Copying Readwise, waiting' }} />

<!-- Length not known yet: the bar moves on its own (and holds still for reduced motion). -->
<Story name="Length unknown" args={{ label: 'Starting' }} />
