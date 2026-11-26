<script module lang="ts">
	/** Where the chat sits on a wide screen: beside the page, in a window over it, or on a page of its own. */
	export type ChatPlace = 'sidebar' | 'floating' | 'fullscreen';
</script>

<script lang="ts">
	import { ChoiceMenu, type Choice } from '$lib/components/ui';

	interface Props {
		value: ChatPlace;
		onchange: (place: ChatPlace) => void;
		align?: 'start' | 'end';
	}

	let { value, onchange, align = 'end' }: Props = $props();

	const choices: Choice[] = [
		{ value: 'sidebar', label: 'Sidebar', icon: 'panel-right' },
		{ value: 'floating', label: 'Floating', icon: 'floating' },
		{ value: 'fullscreen', label: 'Full screen', icon: 'fullscreen' }
	];
</script>

<!-- The chat header's switch between Sidebar, Floating and Full screen. Wide screens only: a phone's chat is always its bottom sheet. -->
<span class="chat-mode-menu">
	<ChoiceMenu label="Where the chat sits" {choices} {value} {align} onchange={(place) => onchange(place as ChatPlace)} />
</span>

<style>
	.chat-mode-menu {
		display: inline-flex;
	}

	@media (max-width: 899.98px) {
		.chat-mode-menu {
			display: none;
		}
	}
</style>
