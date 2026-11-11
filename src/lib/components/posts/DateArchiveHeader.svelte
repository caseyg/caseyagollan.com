<script lang="ts">
	import { PageHeader, SegmentedPill, type Segment } from '$lib/components/ui';

	interface Props {
		year: string;
		month?: string;
		day?: string;
		count?: number;
	}

	let { year, month, day, count }: Props = $props();

	const backLink = $derived(day && month ? `/${year}/${month}/` : month ? `/${year}/` : '/posts/');

	const backText = $derived.by(() => {
		if (day && month) {
			const date = new Date(`${year}-${month}-01`);
			return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
		}
		return month ? year : 'All Posts';
	});

	// The deepest segment is the page being viewed and carries the count.
	const segments = $derived.by(() => {
		const list: Segment[] = [{ label: year, href: `/${year}/` }];
		if (month) list.push({ label: month, href: `/${year}/${month}/` });
		if (month && day) list.push({ label: day, href: `/${year}/${month}/${day}/` });
		const last = list[list.length - 1];
		last.current = true;
		last.count = count;
		return list;
	});
</script>

<PageHeader backHref={backLink} {backText}>
	<SegmentedPill {segments} size="lg" label="Date archive" />
</PageHeader>
