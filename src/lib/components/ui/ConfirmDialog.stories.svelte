<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	const { Story } = defineMeta({ title: 'Primitives/ConfirmDialog', component: ConfirmDialog, parameters: { docs: { story: { height: '320px' } } } });
</script>

<script lang="ts">
	let asking = $state(false);
	let answer = $state('nothing yet');
	let failing = $state(true);
</script>

<!-- Asks before something that can't be undone. Focus starts on Cancel; Escape and Cancel close it, and the agreeing answer runs `onconfirm`. -->
<Story asChild name="Ask">
	<Button onclick={() => (asking = true)}>Delete chat…</Button>
	<p style="color: var(--text-secondary); font-size: var(--fs-sm);">Answered: {answer}</p>
	<ConfirmDialog bind:open={asking} title="Delete this chat?" confirm="Delete" onconfirm={() => { answer = 'Delete'; asking = false; }}>
		“Micropub and syndication threads” and everything said in it will be deleted for good.
	</ConfirmDialog>
</Story>

<!-- When agreeing didn't work the dialog stays open and says why. -->
<Story asChild name="Failed">
	<ConfirmDialog bind:open={failing} title="Delete this chat?" confirm="Delete" error="That didn’t delete. Try again." onconfirm={() => {}}>
		“Micropub and syndication threads” and everything said in it will be deleted for good.
	</ConfirmDialog>
</Story>
