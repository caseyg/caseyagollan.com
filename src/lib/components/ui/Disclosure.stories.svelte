<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Disclosure from './Disclosure.svelte';

	const { Story } = defineMeta({ title: 'Primitives/Disclosure', component: Disclosure, tags: ['!autodocs'] });
</script>

<!-- A quiet line that opens: press it, or focus it and press Enter or Space. -->
<Story asChild name="Line">
	<Disclosure>
		{#snippet summary()}Searched the site, read 2 pages{/snippet}
		<p style="margin: 0">What opens under the line.</p>
	</Disclosure>
</Story>

<Story asChild name="Line, open">
	<Disclosure open>
		{#snippet summary()}Searched the site, read 2 pages{/snippet}
		<p style="margin: 0">What opens under the line.</p>
	</Disclosure>
</Story>

<!-- Rows are for lists; the caller draws the box and the dividers. -->
<Story asChild name="Rows, nested in a line">
	<Disclosure open>
		{#snippet summary()}Three steps{/snippet}
		<div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-lg)">
			<Disclosure variant="row">
				{#snippet summary()}A row with more to show{/snippet}
				<p style="margin: 0">The row's details.</p>
			</Disclosure>
			<Disclosure variant="row" open>
				{#snippet summary(open)}A row that is {open ? 'open' : 'closed'}{/snippet}
				<p style="margin: 0">The row's details.</p>
			</Disclosure>
			<Disclosure variant="row">
				{#snippet summary()}A row with nothing to open is plain text{/snippet}
			</Disclosure>
		</div>
	</Disclosure>
</Story>

<Story asChild name="Long summary on a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	<div style="max-width: 18rem">
		<Disclosure>
			{#snippet summary()}Searched the site 3 times, read 4 pages, looked at 2 pictures, made 6 changes to the table{/snippet}
			<p style="margin: 0">What opens under the line.</p>
		</Disclosure>
	</div>
</Story>
