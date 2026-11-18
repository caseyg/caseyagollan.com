<script lang="ts">
	import { Avatar, Chip } from '$lib/components/ui';
	import type { PersonTag } from '$lib/person-tags';

	interface Props {
		person: PersonTag;
		class?: string;
	}

	let { person, class: className = '' }: Props = $props();
</script>

<!-- A person tag: the chip is the h-card, its href the implied u-url, so parsers read it as u-category h-card. -->
<Chip href={person.url} class="person-tag u-category h-card {className}" title={person.url} rel="noopener">
	{#if person.photo}<Avatar src={person.photo} name={person.name} size="xs" /><data class="u-photo" value={person.photo} hidden></data>{:else}<span aria-hidden="true">@</span>{/if}<span class="p-name">{person.name}</span>
</Chip>

<style>
	:global(.person-tag) {
		max-width: 100%;
	}

	.p-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
