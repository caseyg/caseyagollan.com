<script lang="ts">
	import { onMount } from 'svelte';
	import { FloatingButton } from '$lib/components/ui';
	import { usePageCommands } from '$lib/page-commands.svelte';
	import { sound } from '$lib/sound.svelte';

	let {
		/** Show the state given here instead of the visitor's preference, for stories. */
		enabled: shown,
		/** Float in the page's bottom-left corner. Off only to show it in place, in stories. */
		floating = true
	}: { enabled?: boolean; floating?: boolean } = $props();

	// The server can't know the preference, so the button shows it once the page is live.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const on = $derived(shown ?? (mounted ? sound.enabled : true));

	function toggle() {
		sound.enabled = !sound.enabled;
	}

	usePageCommands(() => [{
		label: 'Sound',
		items: [{ value: 'sound:toggle', label: on ? 'Turn sound off' : 'Turn sound on', icon: on ? '🔇' : '🔊', keywords: ['sound', 'audio', 'mute', 'quiet'] }],
		run: toggle
	}]);
</script>

<!--
	The sounds of the page this sits on, on or off: one choice for the whole site, remembered.
	A speaker while sound is on, a slashed speaker while it's off. Only pages that make sound show it.
-->
<FloatingButton corner={floating ? 'bottom-left' : undefined} icon={on ? 'volume' : 'volume-off'} label={on ? 'Turn sound off' : 'Turn sound on'} onclick={toggle} />
