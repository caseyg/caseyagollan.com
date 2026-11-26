<script lang="ts">
	import { ARENA_USER_NAME, arenaKind } from '$lib/tables';
	import type { Block } from '$lib/tables';

	interface Props {
		block: Block;
		/** Shows the title under the block, as Are.na does, and who made a channel and its size. Off, only the content. */
		details?: boolean;
	}

	let { block, details = true }: Props = $props();

	let failed = $state(false);
	const kind = $derived(arenaKind(block));
	const image = $derived(failed ? undefined : block.image);
	// A text block is its words; its title is only their first line, so it isn't repeated underneath.
	const text = $derived(block.excerpt || block.title);
	const caption = $derived(kind.type === 'channel' || (!image && text.startsWith(block.title.replace(/…$/, ''))) ? '' : block.title);
</script>

<!-- One of Casey's Are.na blocks as Are.na draws it: a square holding the picture whole or the words, the title
     underneath; a channel is a square ruled in its colour, green for open and red for private. -->
<article class="arena-block arena-block--{kind.type}" class:private={kind.private} class:picture={!!image} data-kind="arena">
	<div class="square">
		{#if kind.type === 'channel'}
			<div class="channel">
				<strong class="channel-title">{block.title}</strong>
				{#if details}
					<span>by {ARENA_USER_NAME}</span>
					{#if kind.detail}<span>{kind.detail}</span>{/if}
				{/if}
			</div>
		{:else if image}
			<img src={image} alt="" loading="lazy" decoding="async" draggable="false" onerror={() => (failed = true)} />
		{:else}
			<p class="text">{text}</p>
		{/if}
	</div>
	{#if details && caption}<p class="caption">{caption}</p>{/if}
</article>

<style>
	/* Are.na's own colours: a white ground, gray rules, green open channels and red private ones. */
	.arena-block {
		--arena-ground: #fff;
		--arena-ink: #333;
		--arena-rule: #ccc;
		--arena-open: #17ac10;
		--arena-private: #b60202;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		font-family: var(--font-sans);
		text-align: left;
	}

	.square {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		overflow: hidden;
	}

	/* A picture is shown whole on the canvas's ground, with no frame, as Are.na shows images and links. */
	.square img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.arena-block:not(.picture) .square {
		align-items: stretch;
		justify-content: stretch;
		border: 1px solid var(--arena-rule);
		background: var(--arena-ground);
		color: var(--arena-ink);
	}

	.text {
		margin: 0;
		padding: var(--space-3);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
		overflow: hidden;
		mask-image: linear-gradient(to bottom, black 80%, transparent);
	}

	.arena-block.arena-block--channel .square {
		--channel: var(--arena-open);
		border: 2px solid var(--channel);
		color: var(--channel);
	}

	.arena-block.arena-block--channel.private .square {
		--channel: var(--arena-private);
	}

	.channel {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-3);
		text-align: center;
		font-size: var(--fs-xs);
	}

	.channel-title {
		margin-bottom: var(--space-1);
		font-size: var(--fs-md);
		font-weight: var(--fw-regular);
		line-height: var(--lh-tight);
		overflow-wrap: anywhere;
	}

	.caption {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--fs-xs);
		line-height: var(--lh-snug);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
