<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui';
	import { loadPane, openInStack, type WikiPaneData } from '$lib/wiki/stack';
	import WikiArticle from './WikiArticle.svelte';
	import WikiBacklinks from './WikiBacklinks.svelte';

	interface Props {
		/** Slug of the page being read, the first pane. */
		root: string;
		/** Its title, shown on its spine once panes cover it. */
		title: string;
		/** Slugs of the pages open beside it, left to right. */
		stack: string[];
		/** Called with the new stack when a link opens a pane or a pane is closed. */
		onchange: (stack: string[]) => void;
		/** The page as it reads alone: links in it open panes on wide screens. */
		children: Snippet;
		/** The page as the first pane, when others are open beside it. */
		rootPane: Snippet;
		/** Loads a pane's page. Stories pass sample pages. */
		load?: (slug: string) => Promise<WikiPaneData | null>;
		/** Stack panes whatever the screen width. Otherwise only screens wide enough for two panes do. */
		always?: boolean;
	}

	let { root, title, stack, onchange, children, rootPane, load = loadPane, always = false }: Props = $props();

	/** Width of the strip each covered pane keeps, with its title, matching `--spine`. */
	const SPINE = 40;

	let wide = $state(false);
	let scroller = $state<HTMLElement>();
	let pages = $state<Record<string, WikiPaneData | null | undefined>>({});
	let covered = $state<boolean[]>([]);

	const stacking = $derived(always || wide);
	const active = $derived(stacking && stack.length > 0);

	onMount(() => {
		// Panes need room to sit side by side; narrower screens follow links as usual.
		const query = matchMedia('(min-width: 1000px)');
		const update = () => (wide = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	$effect(() => {
		for (const slug of stack) {
			if (slug in pages) continue;
			pages[slug] = undefined;
			void load(slug).then((page) => (pages[slug] = page));
		}
	});

	function measure() {
		if (!scroller) return;
		const panes = [...scroller.querySelectorAll<HTMLElement>(':scope > .pane')];
		covered = panes.map((pane, index) => {
			const next = panes[index + 1];
			return !!next && next.getBoundingClientRect().left - pane.getBoundingClientRect().left < SPINE * 1.5;
		});
	}

	/** Scrolls so the pane at `index` is in full view, as far left as the stack lets it sit. */
	async function show(index: number) {
		await tick();
		const pane = scroller?.querySelectorAll<HTMLElement>(':scope > .pane')[index];
		if (!scroller || !pane) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		// Panes are all one width; a sticky pane's own offset moves with the scroll, so it can't be used.
		scroller.scrollTo({ left: Math.max(0, index * (pane.offsetWidth - SPINE)), behavior: reduce ? 'auto' : 'smooth' });
		measure();
	}

	function close(index: number) {
		onchange(stack.slice(0, index - 1));
		void show(Math.max(0, index - 2));
	}

	/** Wiki links open beside the pane they are in, rather than replacing the page. */
	function follow(event: MouseEvent) {
		if (!stacking || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
		if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return;
		const match = /^\/wiki\/(.+?)\/?$/.exec(decodeURI(link.pathname));
		if (!match) return;
		const slug = match[1];
		const from = Number(link.closest<HTMLElement>('[data-pane]')?.dataset.pane ?? 0);
		// A link to a heading on the page it is in only scrolls.
		if (link.hash && slug === (from === 0 ? root : stack[from - 1])) return;
		event.preventDefault();
		const next = openInStack(root, stack, from, slug);
		if (next.stack !== stack) onchange(next.stack);
		void show(next.focus);
	}

	let shown = false;
	$effect(() => {
		// The stack changed (opened, closed, or the browser went back): re-check which panes are covered.
		void stack.length;
		if (!active) return void (shown = false);
		// Opened from an address with panes in it: start at the last one.
		if (!shown) void show(stack.length);
		shown = true;
		void tick().then(measure);
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- Delegates clicks on the links inside, which are keyboard reachable themselves. -->
<div class="wiki-stack-host" onclick={follow}>
	{#if active}
		<div class="wiki-stack" bind:this={scroller} onscroll={measure}>
			{#each [root, ...stack] as slug, index (index + slug)}
				{@const page = index === 0 ? undefined : pages[slug]}
				{@const label = index === 0 ? title : (page?.title ?? slug)}
				<section class="pane" class:covered={covered[index]} data-pane={index} style="--index: {index}" aria-label={label}>
					<button type="button" class="spine" tabindex="-1" aria-hidden="true" onclick={() => show(index)}>{label}</button>
					<div class="pane-body">
						{#if index === 0}
							{@render rootPane()}
						{:else}
							<div class="pane-bar">
								<Button variant="icon" size="sm" icon="close" label="Close {label}" onclick={() => close(index)} />
							</div>
							{#if page}
								<WikiArticle {page} />
								<div class="pane-backlinks"><WikiBacklinks pages={page.backlinks} /></div>
							{:else if page === null}
								<p class="note">This page couldn’t be loaded. <a href="/wiki/{slug}" data-sveltekit-reload>Open it on its own</a>.</p>
							{:else}
								<p class="note" aria-live="polite">Loading…</p>
							{/if}
						{/if}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	.wiki-stack {
		--pane-width: min(40rem, calc(100vw - var(--spine) * 2));
		--spine: 40px;
		box-sizing: border-box;
		display: flex;
		height: 100dvh;
		padding-top: calc(var(--nav-lane) + var(--nav-inset));
		overflow: auto hidden;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
	}

	/* Each pane sticks a spine's width right of the one before, so covered panes stay as titled strips. */
	.pane {
		position: sticky;
		left: calc(var(--index) * var(--spine));
		flex: 0 0 var(--pane-width);
		box-sizing: border-box;
		height: 100%;
		overflow: hidden auto;
		border-left: 1px solid var(--border);
		background: var(--bg-primary);
		box-shadow: -0.5rem 0 1.5rem rgb(0 0 0 / 0.18);
		font-size: var(--fs-md);
		line-height: 1.6;
		overflow-wrap: break-word;
		scrollbar-width: thin;
	}

	.pane:first-child {
		border-left: 0;
		box-shadow: none;
	}

	.pane-body {
		padding: var(--space-5) var(--space-6) var(--space-7);
		transition: opacity var(--duration) var(--ease);
	}

	.pane.covered .pane-body {
		opacity: 0;
		pointer-events: none;
	}

	.spine {
		display: none;
		position: sticky;
		top: 0;
		float: left;
		box-sizing: border-box;
		width: var(--spine);
		height: 100%;
		margin: 0;
		padding: var(--space-4) 0;
		border: 0;
		background: var(--bg-primary);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		line-height: var(--spine);
		text-align: start;
		white-space: nowrap;
		writing-mode: vertical-rl;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.spine:hover {
		color: var(--text-primary);
	}

	.pane.covered .spine {
		display: block;
	}

	.pane-bar {
		display: flex;
		justify-content: flex-end;
		margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-4)) 0 0;
	}

	.pane-backlinks {
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	.note {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
