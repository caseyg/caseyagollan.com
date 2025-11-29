<script lang="ts">
	let {
		topic,
		insight,
		active = false,
		isStreaming = false,
		isThinking = false,
		sources = [],
		onclick
	}: {
		topic: string;
		insight: string;
		active?: boolean;
		isStreaming?: boolean;
		isThinking?: boolean;
		sources?: Array<{ url: string; title: string; page_age: string | null; cited_text: string | null }>;
		onclick?: () => void;
	} = $props();
</script>

<div class="insight-item" class:active class:streaming={isStreaming} role="button" tabindex="0" {onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()}>
	<span class="insight-node-pill">{topic}</span>
	<p class="insight-text" class:loading={!insight && isStreaming} class:streaming={isStreaming && insight}>
		{#if insight}
			{insight}
		{:else if isStreaming}
			<span class="loading-shapes">
				<svg width="12" height="12" viewBox="-6 -6 12 12">
					<circle r="4" fill="white" class="shape shape-circle" />
					<polygon points="0,-5 1.2,-1.6 5,-1.6 2,0.8 3.2,5 0,2.4 -3.2,5 -2,0.8 -5,-1.6 -1.2,-1.6" fill="white" class="shape shape-star" />
					<polygon points="0,-5 5,4 -5,4" fill="white" class="shape shape-triangle" />
					<rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" fill="white" class="shape shape-square" />
				</svg>
			</span>
			<span class="shimmer-text">
				<span class="shimmer-letter" style="animation-delay: 0s">R</span><span class="shimmer-letter" style="animation-delay: 0.08s">e</span><span class="shimmer-letter" style="animation-delay: 0.16s">s</span><span class="shimmer-letter" style="animation-delay: 0.24s">e</span><span class="shimmer-letter" style="animation-delay: 0.32s">a</span><span class="shimmer-letter" style="animation-delay: 0.4s">r</span><span class="shimmer-letter" style="animation-delay: 0.48s">c</span><span class="shimmer-letter" style="animation-delay: 0.56s">h</span><span class="shimmer-letter" style="animation-delay: 0.64s">i</span><span class="shimmer-letter" style="animation-delay: 0.72s">n</span><span class="shimmer-letter" style="animation-delay: 0.8s">g</span>
			</span>
		{:else}
			Loading...
		{/if}
	</p>
</div>

<style>
	.insight-item {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-left: 3px solid transparent;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		overflow: visible;
		cursor: pointer;
		transition: all 0.3s ease;
		width: 100%;
		height: 100%;
	}

	.insight-item .insight-text {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 0.85rem;
	}

	.insight-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-left-color: rgba(255, 255, 255, 0.3);
	}

	.insight-item.active {
		background: rgba(100, 100, 255, 0.15);
		border-left-color: blue;
	}

	.insight-node-pill {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border-radius: 0;
		font-size: 0.85rem;
		font-weight: 500;
		margin-bottom: 0.75rem;
		align-self: flex-start;
		transition: background 0.3s ease;
	}

	.insight-item.active .insight-node-pill {
		background: blue;
	}

	.insight-text {
		font-style: italic;
		color: white;
		margin: 0;
		line-height: 1.5;
	}

	.insight-text.loading {
		color: rgba(255, 255, 255, 0.5);
	}

	.insight-text.streaming {
		font-style: italic;
	}

	.loading-shapes {
		display: inline-block;
		vertical-align: middle;
		margin-right: 0.5rem;
	}

	.loading-shapes svg {
		display: block;
	}

	/* Shape cycling animation (instant swap) */
	@keyframes shape-cycle {
		0%, 24.9% { opacity: 1; }
		25%, 100% { opacity: 0; }
	}

	.loading-shapes .shape {
		opacity: 0;
	}

	.loading-shapes .shape-circle {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 0s;
		opacity: 1;
	}

	.loading-shapes .shape-star {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 0.5s;
	}

	.loading-shapes .shape-triangle {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 1s;
	}

	.loading-shapes .shape-square {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 1.5s;
	}

	.shimmer-text {
		font-style: italic;
	}

	.shimmer-letter {
		animation: letter-shimmer 1.5s ease-in-out infinite;
	}

	@keyframes letter-shimmer {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
</style>
