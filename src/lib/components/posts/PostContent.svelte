<script lang="ts">
	import { Prose } from '$lib/components/ui';
	import { renderContentSync } from '$lib/utils/renderContent';

	interface Props {
		content: string;
		format?: 'text' | 'html' | 'markdown';
	}

	let { content, format = 'markdown' }: Props = $props();
</script>

<Prose class="e-content post-content">
	{@html renderContentSync(content, format)}
</Prose>
