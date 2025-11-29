<script lang="ts">
	interface Props {
		title: string;
		count: number;
		backLink?: string;
		backText?: string;
	}

	let { title, count, backLink = '/posts/', backText = 'All Posts' }: Props = $props();
</script>

<div class="header">
	{#if backLink}
		<a href={backLink} class="back-link">{backText}</a>
	{/if}
	<h1 class="page-title">{title} <span class="count">({count})</span></h1>
</div>

<style>
	.header {
		margin-bottom: 3rem;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 0.875rem;
		display: inline-block;
		margin-bottom: 0.5rem;
	}

	.back-link:hover {
		color: #fff;
	}

	.back-link::before {
		content: '← ';
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 500;
		margin: 0;
	}

	.count {
		font-weight: 400;
		color: rgba(255, 255, 255, 0.7);
	}
</style>
