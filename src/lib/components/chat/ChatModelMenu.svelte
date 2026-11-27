<script lang="ts">
	import type { ChatModelChoices } from '$lib/chat-models';
	import { ChoiceMenu, type Choice } from '$lib/components/ui';

	interface Props {
		/** The models this chat could answer with, and the one it does. */
		models: ChatModelChoices;
		/** Called with the key of the model chosen. */
		onchange: (model: string) => void;
		align?: 'start' | 'end';
		/** Which way the menu opens: up from a composer at the foot of the page. */
		side?: 'top' | 'bottom';
	}

	let { models, onchange, align = 'end', side = 'top' }: Props = $props();

	const choices = $derived<Choice[]>(models.models.map((model) => ({ value: model.key, label: model.name, short: model.short, detail: model.detail, group: model.provider })));
</script>

<!-- The composer's Model menu: which model answers this chat from here on, under who serves it. Casey's alone. -->
<span class="chat-model-menu">
	<ChoiceMenu label="Model for this chat" {choices} value={models.current} {align} {side} text onchange={onchange} />
</span>

<style>
	/* Beside the box, never squeezing it: a long name is cut short. */
	.chat-model-menu {
		display: inline-flex;
		flex-shrink: 0;
		max-width: 8rem;
		min-width: 0;
	}
</style>
