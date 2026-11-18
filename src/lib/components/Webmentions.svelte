<script lang="ts">
	import { onMount } from 'svelte';
	import WebmentionList from './WebmentionList.svelte';
	import { applyModeration, emptyModeration, type ModerationAction } from '$lib/webmentions';
	import { loadMentions, remark, type MentionsSession, type ShownMention } from '$lib/webmentions-client';

	interface Props {
		/** The post's path. */
		url: string;
		/** Addresses the post had before a rename; their mentions show here too. */
		previous?: string[];
	}

	let { url, previous = [] }: Props = $props();

	let session = $state<MentionsSession | null>(null);
	let mentions = $state<ShownMention[]>([]);
	let moderation = $state(emptyModeration());
	let loading = $state(true);

	onMount(() => {
		loadMentions([url, ...previous])
			.then((loaded) => {
				session = loaded;
				mentions = loaded.mentions;
				moderation = loaded.moderation;
			})
			.catch((cause) => console.error('Webmentions error:', cause))
			.finally(() => (loading = false));
	});

	/** Shows the change at once and puts it back if it wasn't saved. */
	async function moderate(change: ModerationAction) {
		if (!session) return;
		const before = moderation;
		moderation = applyModeration(moderation, change);
		mentions = remark(mentions, moderation);
		try {
			await session.moderate(change);
		} catch (cause) {
			moderation = before;
			mentions = remark(mentions, before);
			throw cause;
		}
	}
</script>

<WebmentionList {mentions} {moderation} {loading} mode={session?.mode ?? 'visitor'} onModerate={moderate} />
