<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PullDown from './PullDown.svelte';

	const { Story } = defineMeta({ title: 'Primitives/PullDown', component: PullDown, parameters: { viewport: { defaultViewport: 'mobile1' }, docs: { story: { height: '320px', inline: false } } } });
</script>

<script lang="ts">
	let pulls = $state(0);
</script>

<!-- On a touch screen, pull down from the top of the page: a tab follows the finger, says when letting go will act, and springs back. It holds the page still while it does, so the browser's pull-to-refresh doesn't also start. Graphs and other surfaces with their own dragging keep their gestures below the top band. The site uses it to open the command palette on phones. Use touch emulation to try it. -->
<Story asChild name="Pull for commands">
	<PullDown onPull={() => pulls++} />
	<p>Pulled open {pulls} {pulls === 1 ? 'time' : 'times'}.</p>
</Story>
