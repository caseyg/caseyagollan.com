<script lang="ts">
	import { renderContentSync } from '$lib/utils/renderContent';

	interface Props {
		content: string;
	}

	let { content }: Props = $props();
</script>

<div class="e-content post-content">
	{@html renderContentSync(content)}
</div>

<style>
	.post-content {
		margin: 0;
		line-height: 1.65;
	}

	.post-content :global(p) {
		margin: 0 0 1rem;
	}

	.post-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.post-content :global(a) {
		color: #fff;
		text-decoration: underline;
		text-decoration-color: rgba(255, 255, 255, 0.4);
		text-underline-offset: 0.15em;
		transition: text-decoration-color 0.15s ease;
	}

	.post-content :global(a:hover) {
		text-decoration-color: #fff;
	}

	.post-content :global(strong) {
		font-weight: 600;
	}

	.post-content :global(em) {
		font-style: italic;
	}

	.post-content :global(code) {
		font-family: ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Mono', monospace;
		font-size: 0.9em;
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}

	.post-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		margin: 1rem 0;
	}

	.post-content :global(pre code) {
		background: none;
		padding: 0;
	}

	.post-content :global(blockquote) {
		margin: 1rem 0;
		padding-left: 1rem;
		border-left: 3px solid rgba(255, 255, 255, 0.3);
		color: rgba(255, 255, 255, 0.85);
		font-style: italic;
	}

	.post-content :global(ul),
	.post-content :global(ol) {
		margin: 1rem 0;
		padding-left: 1.5rem;
	}

	.post-content :global(li) {
		margin-bottom: 0.5rem;
	}

	.post-content :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 4px;
		margin: 1rem 0;
	}

	/* oEmbed video containers */
	.post-content :global(.embed) {
		margin: 1.5rem 0;
	}

	.post-content :global(.embed-video) {
		position: relative;
		padding-bottom: 56.25%;
		height: 0;
		overflow: hidden;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.2);
	}

	.post-content :global(.embed-video iframe) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
</style>
