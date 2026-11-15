<script lang="ts">
	import { onMount } from 'svelte';
	import { SegmentedPill } from '$lib/components/ui';
	import { usePageCommands } from '$lib/page-commands.svelte';
	import { sound } from '$lib/sound.svelte';

	let {
		/** Show the state given here instead of the visitor's preference, for stories. */
		enabled: shown
	}: { enabled?: boolean } = $props();

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
	The sounds of the page this sits on, on or off. One choice for the whole site, remembered.
	Quiet, not blue: it is a setting, not a place to go.
-->
<SegmentedPill
	size="md"
	tone="quiet"
	compact
	segments={[{
		label: 'Sound',
		icon: on ? '🔊' : '🔇',
		pressed: on,
		title: on ? 'Turn sound off' : 'Turn sound on',
		onclick: toggle
	}]}
/>
