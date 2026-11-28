<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TablePostMenu from './TablePostMenu.svelte';

	const { Story } = defineMeta({ title: 'Tables/TablePostMenu', component: TablePostMenu, args: { onpost: () => {} } });
</script>

<!-- Press Post: a draft post that frames the table, or one with its picture. -->
<Story name="Published table" args={{ published: true }} />

<!-- A draft table can be embedded, but readers see it only once the table is published. -->
<Story name="Draft table" args={{ published: false }} />

<!-- While the picture is drawn and the draft is saved. -->
<Story name="Posting" args={{ busy: true }} />
