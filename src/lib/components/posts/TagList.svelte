<script lang="ts">
	interface Props {
		/** Every tag with the number of posts that carry it, in any order. */
		tags: { name: string; href: string; count: number }[];
	}

	let { tags }: Props = $props();

	// A cloud: alphabetical, with the most used tags largest. Sizes follow the logarithm of the
	// count, so one very common tag does not flatten all the others.
	const STEPS = 5;
	const sorted = $derived(tags.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
	const most = $derived(Math.max(1, ...tags.map((tag) => tag.count)));
	const step = (count: number) => (most === 1 ? 1 : 1 + Math.round(((STEPS - 1) * Math.log(count)) / Math.log(most)));
</script>

<ul class="tag-cloud" aria-label="Tags">
	{#each sorted as tag (tag.href)}
		<li>
			<a href={tag.href} class="size-{step(tag.count)}" title="{tag.count} {tag.count === 1 ? 'post' : 'posts'}">{tag.name}<span class="visually-hidden">, {tag.count} {tag.count === 1 ? 'post' : 'posts'}</span></a>
		</li>
	{/each}
</ul>

<style>
	.tag-cloud {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		line-height: var(--lh-snug);
	}

	a {
		color: var(--text-secondary);
		text-decoration: none;
		transition: color var(--duration) var(--ease);
	}

	a:hover {
		color: var(--text-primary);
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.size-1 { font-size: var(--fs-sm); }
	.size-2 { font-size: var(--fs-md); }
	.size-3 { font-size: var(--fs-xl); color: var(--text-primary); }
	.size-4 { font-size: var(--fs-2xl); color: var(--text-primary); font-weight: var(--fw-medium); }
	.size-5 { font-size: var(--fs-3xl); color: var(--text-primary); font-weight: var(--fw-medium); }

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
