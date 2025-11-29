<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="container">
	{@render children()}
</div>

<style>
	/*
	 * Font Loading Strategy:
	 * Use a system font stack with similar metrics to ff-dagny-web-pro
	 * to minimize layout shift (CLS) during font loading.
	 */
	@font-face {
		font-family: 'Dagny Fallback';
		src: local('Avenir Next'), local('Avenir'), local('Helvetica Neue'), local('Helvetica'), local('Arial');
		size-adjust: 100%;
		ascent-override: 95%;
		descent-override: 25%;
		line-gap-override: 0%;
	}

	:global(html) {
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
	}

	:global(body) {
		background: #808080;
		color: #fff;
		font-family: ff-dagny-web-pro, 'Dagny Fallback', system-ui, -apple-system, sans-serif;
		font-weight: 400;
		margin: 0;
		padding: 0;
		font-size: 1.125rem;
		line-height: 1.6;
	}

	.container {
		max-width: 38rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	@media (max-width: 600px) {
		:global(body) {
			font-size: 1rem;
		}

		.container {
			padding: 1.5rem 1rem;
		}
	}
</style>
