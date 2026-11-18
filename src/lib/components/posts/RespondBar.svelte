<script lang="ts">
	import { Icon, Popover, type IconName } from '$lib/components/ui';
	import RespondPanel from './RespondPanel.svelte';
	import { postCopies, type RespondAction, type WebmentionOutcome } from '$lib/respond';

	interface Props {
		/** The post's canonical address. */
		url: string;
		title?: string;
		/** The post's `syndication` links; the copies on Mastodon and Bluesky are read from them. */
		syndication?: string[];
		/** Stand-ins for stories. */
		send?: (source: string, target: string) => Promise<WebmentionOutcome>;
		openUrl?: (url: string) => void;
	}

	let { url, title = '', syndication = [], send, openUrl }: Props = $props();

	const copies = $derived(postCopies(syndication));

	const ACTIONS: { action: RespondAction; icon: IconName; label: string; name: string }[] = [
		{ action: 'reply', icon: 'reply', label: 'Reply', name: 'Reply to this post' },
		{ action: 'like', icon: 'heart', label: 'Like', name: 'Like this post' },
		{ action: 'repost', icon: 'repost', label: 'Repost', name: 'Repost this post' }
	];

	let open = $state<Record<RespondAction, boolean>>({ reply: false, like: false, repost: false });
	let views = $state<Record<RespondAction, 'list' | 'mastodon' | 'web'>>({ reply: 'list', like: 'list', repost: 'list' });

	// Each menu starts at its list again after closing.
	$effect(() => {
		for (const { action } of ACTIONS) if (!open[action] && views[action] !== 'list') views[action] = 'list';
	});
</script>

<!--
	Ways to answer the post, kept to one quiet row: each button opens where to do it. The
	`indie-action` wrappers let indie-config and similar browser tools offer the visitor's own site.
-->
<div class="respond-bar" role="group" aria-label="Respond to this post">
	{#each ACTIONS as item (item.action)}
		<indie-action do={item.action} with={url}>
			<Popover label={item.name} bind:open={open[item.action]} triggerClass="respond-trigger">
				{#snippet trigger()}<Icon name={item.icon} size={16} /><span>{item.label}</span>{/snippet}
				<RespondPanel action={item.action} {url} {title} {copies} bind:view={views[item.action]} onDone={() => (open[item.action] = false)} {send} {openUrl} />
			</Popover>
		</indie-action>
	{/each}
</div>

<style>
	.respond-bar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-6);
		margin-left: calc(-1 * var(--space-2));
	}

	indie-action {
		display: contents;
	}

	:global(.respond-trigger) {
		padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
		color: var(--text-muted);
	}
</style>
