<script lang="ts">
	import { Prose } from '$lib/components/ui';
	import { renderContentSync } from '$lib/utils/renderContent';
	import { localizeLinks } from '$lib/wiki/links';

	interface Props {
		content: string;
		format?: 'text' | 'html' | 'markdown';
	}

	let { content, format = 'markdown' }: Props = $props();
</script>

<Prose class="e-content post-content">
	{@html localizeLinks(renderContentSync(content, format))}
</Prose>
