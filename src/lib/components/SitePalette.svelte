<script lang="ts">
	import { goto } from '$app/navigation';
	import { COMPOSER_KINDS, type ComposerKind } from '$lib/composer-kinds';
	import { ownerHint } from '$lib/owner';
	import { searchPrivateArena } from '$lib/arena-client';
	import { pageCommands } from '$lib/page-commands.svelte';
	import { TYPE_ICONS } from '$lib/posts-filter';
	import { CommandPalette, PullDown, type CommandOption, type CommandSection, type MenuOption } from '$lib/components/ui';

	interface Props {
		/** Opens the site search, with the text typed so far. */
		onSearch: (query: string) => void;
		open?: boolean;
	}

	let { onSearch, open = $bindable(false) }: Props = $props();
	let query = $state('');

	interface PagefindResult { url: string; meta: { title?: string; type?: string }; excerpt: string }
	interface Pagefind {
		options(options: Record<string, unknown>): Promise<void>;
		debouncedSearch(query: string, options?: object, timeout?: number): Promise<{ results: { data(): Promise<PagefindResult> }[] } | null>;
	}

	// A variable, so Vite leaves the index's own script alone.
	const PAGEFIND = '/pagefind/pagefind.js';
	const RESULT_ICONS: Record<string, string> = { ...TYPE_ICONS, book: '📚', wiki: '📓', arena: '✳️' };

	/** The index stores titles and excerpts as HTML. */
	const plainText = (html = '') => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

	/**
	 * Once earlier keystrokes have loaded part of the index, Pagefind can answer a word it lacks
	 * with pages matching only a shorter one ("mamdani" finding "MoMA"). Keep a result when a
	 * word it marked starts like a word that was typed.
	 */
	const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1);
	function matches(excerpt: string, typed: string) {
		const marked = [...excerpt.matchAll(/<mark>(.*?)<\/mark>/g)].flatMap((match) => words(match[1].replace(/['’.]/g, '')));
		return words(typed).some((word) => {
			const stem = word.slice(0, 4);
			return marked.some((found) => found.startsWith(stem));
		});
	}

	const places: CommandOption[] = [
		{ value: 'go:/', label: 'Home', icon: '👋', keywords: ['about', 'bio', 'casey'] },
		{ value: 'go:/library/', label: 'Library', icon: '📚', keywords: ['books', 'reading', 'graph'] },
		{ value: 'go:/posts/', label: 'Posts', icon: '📡', keywords: ['feed', 'blog', 'notes'] },
		{ value: 'go:/tables/', label: 'Tables', icon: '🗂️', keywords: ['canvas', 'boards', 'collections', 'tldraw'] }
	];
	const write: CommandOption = {
		value: 'write',
		label: 'Write a post',
		icon: '✏️',
		keywords: ['new', 'compose', 'publish'],
		items: (Object.entries(COMPOSER_KINDS) as [ComposerKind, (typeof COMPOSER_KINDS)[ComposerKind]][]).map(([kind, { label, hint }]) => ({
			value: `new:/new/${kind}/`,
			label,
			hint,
			icon: TYPE_ICONS[kind as keyof typeof TYPE_ICONS] ?? '✉️'
		}))
	};

	// The posts menu (each type and year, with counts) loads the first time the palette opens.
	let postsMenu = $state<MenuOption[]>([]);
	let menuRequested = false;
	// Writing is offered only where the owner has signed in; the composer checks the session itself.
	let owner = $state(false);
	$effect(() => {
		if (open) owner = ownerHint();
	});

	$effect(() => {
		if (!open || menuRequested) return;
		menuRequested = true;
		fetch('/commands.json')
			.then((response): Promise<{ posts: MenuOption[] }> => (response.ok ? response.json() : Promise.resolve({ posts: [] })))
			.then((data) => (postsMenu = data.posts))
			.catch(() => (menuRequested = false));
	});
	const toCommand = (option: MenuOption): CommandOption => ({ value: `go:${option.href}`, label: option.label, icon: option.icon, count: option.count });
	// The posts menu has named its groups both ways.
	const inGroup = (...names: string[]) => postsMenu.filter((option) => option.group && names.includes(option.group)).map(toCommand);
	const postTypes = $derived(inGroup('Type', 'By type'));
	const years = $derived(inGroup('Year', 'By year'));

	// Typing also searches posts, books, the wiki and Are.na, for the few best matches.
	let pagefind: Promise<Pagefind> | undefined;
	let results = $state<CommandOption[]>([]);
	let searching = $state(false);
	$effect(() => {
		const term = query.trim();
		if (term.length < 2) {
			results = [];
			searching = false;
			return;
		}
		let stale = false;
		searching = true;
		pagefind ??= import(/* @vite-ignore */ PAGEFIND).then(async (module: Pagefind) => {
			await module.options({ baseUrl: '/' });
			return module;
		});
		pagefind
			.then((module) => module.debouncedSearch(term, {}, 150))
			.then(async (search) => {
				if (!search || stale) return;
				const found = (await Promise.all(search.results.slice(0, 12).map((result) => result.data()))).filter((result) => matches(result.excerpt, term)).slice(0, 6);
				if (stale) return;
				results = found.map((result) => ({
						value: `open:${result.url}`,
						label: plainText(result.meta.title) || result.url,
						hint: plainText(result.excerpt),
						icon: RESULT_ICONS[result.meta.type ?? ''] ?? '📄',
						external: /^https?:/.test(result.url),
						// The index already matched these.
						always: true
				}));
			})
			.catch(() => (results = []))
			.finally(() => {
				if (!stale) searching = false;
			});
		return () => {
			stale = true;
		};
	});

	// For the signed-in owner, Casey's private Are.na blocks too, which the public index never holds.
	let privateResults = $state<CommandOption[]>([]);
	$effect(() => {
		const typed = query.trim();
		if (!owner || typed.length < 2) {
			privateResults = [];
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			const blocks = await searchPrivateArena(typed, 5, controller.signal);
			if (controller.signal.aborted) return;
			privateResults = blocks.map((block) => ({ value: `open:${block.url}`, label: block.title, hint: block.meta, icon: '🔒', external: true, always: true }));
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const term = $derived(query.trim());
	const search: CommandOption = $derived({ value: 'search', label: 'Search posts, books, wiki, and Are.na', hint: term ? `For “${term}”` : undefined, icon: '🔍', keywords: ['find'], always: !!term });
	// The page's own commands come first, then places, then what the search index found.
	const forPage = $derived(pageCommands());
	const sections: CommandSection[] = $derived([
		...(term ? [] : [{ items: [search] }]),
		...forPage.map(({ label, items }) => ({ label, items })),
		{ label: 'Go to', items: places },
		{ label: 'Post types', items: postTypes },
		{ label: 'Write', items: owner ? [write] : [] },
		{ label: 'Years', items: years },
		...(term ? [{ label: 'Posts, books, wiki, and Are.na', items: results }, { label: 'Private on Are.na', items: privateResults }, { items: [search] }] : [])
	]);

	// Commands that go to a page are links too, so ⌘-click can open them in a new tab.
	const LINK = /^(?:go|open|new):(.+)$/;
	const linked = (item: CommandOption): CommandOption => ({ ...item, href: item.href ?? item.value.match(LINK)?.[1], items: item.items?.map(linked) });
	const linkedSections = $derived(sections.map((section) => ({ ...section, items: section.items.map(linked) })));

	function onAction(value: string) {
		const page = forPage.find((section) => section.run && section.items.some((item) => item.value === value));
		if (page && !value.startsWith('go:')) return page.run?.(value);
		const [kind, ...rest] = value.split(':');
		const target = rest.join(':');
		if (kind === 'go') return goto(target);
		// The composer and search results are full pages of their own.
		if (kind === 'new' || kind === 'open') return void window.location.assign(target);
		if (kind === 'search') {
			const typed = term;
			// Let the palette close and hand back focus before search takes it.
			requestAnimationFrame(() => onSearch(typed));
		}
	}
</script>

<!-- On a phone, with no keyboard shortcut, pulling down from the top of the page opens it. -->
<PullDown onPull={() => (open = true)} disabled={open} />
<CommandPalette sections={linkedSections} {onAction} bind:open bind:query status={searching && term.length >= 2 && !results.length ? 'Searching…' : ''} />
