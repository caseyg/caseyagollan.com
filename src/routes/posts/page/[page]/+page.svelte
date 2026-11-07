<script lang="ts">
	import PostsPage from '../../+page.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<PostsPage {data} />
