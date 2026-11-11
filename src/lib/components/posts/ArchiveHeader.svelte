<script lang="ts">
	import { Count, Heading, PageHeader } from '$lib/components/ui';

	interface Props {
		title: string;
		count: number;
		backLink?: string;
		backText?: string;
	}

	let { title, count, backLink = '/posts/', backText = 'All Posts' }: Props = $props();
</script>

<PageHeader backHref={backLink} {backText}>
	<Heading level={1} size="section" class="archive-title">{title} <Count value={count} label="{count} posts" /></Heading>
</PageHeader>

<style>
	:global(.archive-title) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
