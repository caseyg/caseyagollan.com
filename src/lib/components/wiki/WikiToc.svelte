<script lang="ts">
	import { onMount } from 'svelte';
	import { Heading } from '$lib/components/ui';
	import type { WikiHeading } from '$lib/wiki/types';

	interface Props {
		headings: WikiHeading[];
	}

	let { headings }: Props = $props();
	const id = $props.id();

	// Only the top two levels the page uses, so a long page's outline stays short.
	const shown = $derived.by(() => {
		const levels = [...new Set(headings.map((heading) => heading.level))].sort().slice(0, 2);
		return headings.filter((heading) => levels.includes(heading.level));
	});
	const top = $derived(Math.min(...shown.map((heading) => heading.level)));
	let active: string | undefined = $state();

	onMount(() => {
		// The section being read is the last heading that has scrolled past the top third of the window.
		const targets = shown.map((heading) => document.getElementById(heading.id)).filter((element): element is HTMLElement => !!element);
		if (!targets.length) return;
		const update = () => {
			const line = window.innerHeight / 3;
			active = targets.findLast((element) => element.getBoundingClientRect().top < line)?.id ?? targets[0].id;
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		return () => window.removeEventListener('scroll', update);
	});
</script>

{#if shown.length > 1}
	<nav class="wiki-toc" aria-labelledby={id}>
		<Heading level={2} size="label" {id}>On this page</Heading>
		<ol>
			{#each shown as heading (heading.id)}
				<li class:nested={heading.level > top}>
					<a href="#{heading.id}" aria-current={active === heading.id ? 'location' : undefined}>{heading.text}</a>
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	.wiki-toc {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	ol {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nested {
		padding-left: var(--space-3);
	}

	a {
		display: block;
		padding: 2px 0 2px var(--space-2);
		border-left: 2px solid transparent;
		color: var(--text-muted);
		text-decoration: none;
		transition: color var(--duration) var(--ease), border-color var(--duration) var(--ease);
	}

	a:hover {
		color: var(--text-primary);
	}

	a[aria-current] {
		border-left-color: var(--text-primary);
		color: var(--text-primary);
	}
</style>
