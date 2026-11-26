<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatSelection from './ChatSelection.svelte';

	const items = [
		{ id: 'b1', type: 'post', title: 'Writing again' },
		{ id: 'b2', type: 'book', title: 'The Dispossessed' },
		{ id: 'n1', type: 'note', title: 'Why the site' }
	];

	const { Story } = defineMeta({
		title: 'Chat/ChatSelection',
		component: ChatSelection,
		args: { items, onclear: () => {} }
	});
</script>

<!-- Above the composer on a table: what the next message will act on. The × clears the canvas's selection. -->
<Story name="Several selected" />

<Story name="One selected" args={{ items: [items[1]] }} />

<!-- Under a sent message: what was selected when it was written. -->
<Story name="On a sent message" args={{ items, count: 12, onclear: undefined }} />
