<script lang="ts">
	import { PageHeader, SelectMenu, type MenuOption } from '$lib/components/ui';

	interface Props {
		current: string;
		currentIcon?: string;
		options: MenuOption[];
		count?: number;
		countDescription?: string;
		backLink?: string;
		backText?: string;
	}

	let { current, currentIcon, options, count, countDescription, backLink = '/posts/', backText = 'All Posts' }: Props = $props();
</script>

<PageHeader backHref={backLink} {backText} description={countDescription}>
	<SelectMenu {current} {currentIcon} {count} {options} />
</PageHeader>
