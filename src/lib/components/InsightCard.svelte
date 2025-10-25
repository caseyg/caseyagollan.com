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
		sources?: Array<{ url: string; title: string }>;
		onclick?: () => void;
	} = $props();

	// Extract domain from URL for favicon
	function getFaviconUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
		} catch {
			return '';
		}
	}
</script>

<div class="insight-item" class:active class:streaming={isStreaming} role="button" tabindex="0" {onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()}>
	<span class="insight-node-pill">{topic}</span>
	<p class="insight-text" class:loading={!insight && isStreaming} class:streaming={isStreaming && insight}>
		{#if insight}
			{insight}
		{:else if isStreaming}
			<span class="loading-pulse">●</span> Generating...
		{:else}
			Loading...
		{/if}
	</p>

	{#if sources && sources.length > 0 && !isStreaming}
		<div class="sources-footer">
			{#each sources as source (source.url)}
				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="favicon-link"
					title={source.title}
				>
					<img src={getFaviconUrl(source.url)} alt={source.title} class="favicon" />
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.insight-item {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-left: 3px solid transparent;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
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
		position: absolute;
		bottom: 0;
		left: 0;
		width: 320px;
		height: 400px;
		overflow-y: auto;
		scroll-behavior: smooth;
		background: rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.insight-item:hover .insight-text {
		display: block;
		-webkit-line-clamp: unset;
		-webkit-box-orient: unset;
		overflow: visible;
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

	.loading-pulse {
		display: inline-block;
		animation: pulse 1s ease-in-out infinite;
		color: rgb(150, 150, 255);
		font-size: 1.2rem;
		margin-right: 0.5rem;
	}


	@keyframes pulse {
		0%, 100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	.sources-footer {
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.favicon-link {
		display: inline-block;
		transition: transform 0.2s ease, opacity 0.2s ease;
		opacity: 0.8;
	}

	.favicon-link:hover {
		transform: scale(1.1);
		opacity: 1;
	}

	.favicon {
		width: 20px;
		height: 20px;
		display: block;
		border-radius: 2px;
	}
</style>
