<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Button from '../ui/Button.svelte';

	interface Props {
		/** One entry per post of the thread. A single entry is an ordinary post. */
		posts: string[];
		/** Form field name; it repeats once per post, in order. */
		name: string;
		/** Prefix for each post's textarea id: `${id}-0`, `${id}-1`, … */
		id: string;
		/** Accessible name of the first post, such as "Post text" or "Bluesky post text". */
		label?: string;
		/** Characters allowed per post. */
		limit: number;
		/** Counts a post as the networks it goes to would. */
		count: (text: string) => number;
		/** Most posts the thread can hold. */
		max?: number;
		/** Show each post's own count. Off for a single post, whose count lives in the toolbar. */
		counts?: boolean;
		/** Offer to split: shown when a post is too long, or the full text would not fit in one. */
		onsplit?: () => void;
		/** Called after a post's text changes, with the textarea, for mention suggestions. */
		oninput?: (index: number, event: Event) => void;
		/** Called when the caret moves in a post (click, keys), for mention suggestions. */
		ontrack?: (index: number, event: Event) => void;
		/** Shown under a post's text, such as mention suggestions for the post being typed in. */
		below?: Snippet<[number]>;
		/** Things attached to one post, such as its photos. */
		attachments?: Snippet<[number]>;
	}

	let { posts = $bindable(), name, id, label = 'Post text', limit, count, max = 20, counts, onsplit, oninput, ontrack, below, attachments }: Props = $props();

	const thread = $derived(posts.length > 1);
	const showCounts = $derived(counts ?? thread);
	const lengths = $derived(posts.map(count));
	const over = $derived(lengths.some(length => length > limit));
	// Offer another post once the last one has something in it.
	const canAdd = $derived(posts.length < max && !!posts.at(-1)?.trim());

	const field = (index: number) => document.getElementById(`${id}-${index}`) as HTMLTextAreaElement | null;
	async function focus(index: number, at: 'start' | 'end' = 'end') {
		await tick();
		const target = field(index); if (!target) return;
		target.focus();
		const caret = at === 'start' ? 0 : target.value.length;
		target.setSelectionRange(caret, caret);
	}
	async function add() {
		posts = [...posts, ''];
		await focus(posts.length - 1);
	}
	async function remove(index: number) {
		posts = posts.filter((_, i) => i !== index);
		await focus(Math.max(0, index - 1));
	}
	function keydown(index: number, event: KeyboardEvent) {
		const target = event.currentTarget as HTMLTextAreaElement;
		// Backspace in an empty post removes it, as in Bluesky's and Mastodon's thread composers.
		if (event.key === 'Backspace' && !target.value && index > 0) { event.preventDefault(); remove(index); }
	}
</script>

<!-- A thread of posts: each is a plain textarea, joined to the next by a line, like a thread on the site. -->
<ol class="thread-composer" class:thread aria-label={thread ? `Thread of ${posts.length} posts` : undefined}>
	{#each posts as text, index (index)}
		<li class="post" class:connected={index < posts.length - 1}>
			{#if thread}<span class="rail" aria-hidden="true"><span class="number">{index + 1}</span></span>{/if}
			<div class="main">
				<textarea id="{id}-{index}" class="body" {name} rows={index ? 2 : 4}
					aria-label={index ? `Post ${index + 1} of ${posts.length}` : thread ? `${label}, post 1 of ${posts.length}` : label}
					placeholder={index ? 'Add another post' : undefined}
					value={text}
					oninput={(event) => { posts[index] = event.currentTarget.value; oninput?.(index, event); }}
					onclick={(event) => ontrack?.(index, event)}
					onkeyup={(event) => ontrack?.(index, event)}
					onkeydown={(event) => keydown(index, event)}></textarea>
				{@render below?.(index)}
				{@render attachments?.(index)}
				{#if showCounts || thread}
					<div class="meta">
						{#if showCounts}<span class="count" class:over={lengths[index] > limit}>{lengths[index]}/{limit}</span>{/if}
						{#if thread}<Button variant="icon" size="sm" icon="close" label="Remove post {index + 1}" onclick={() => remove(index)} />{/if}
					</div>
				{/if}
			</div>
		</li>
	{/each}
</ol>
{#if canAdd || onsplit}
	<div class="actions">
		{#if onsplit}<Button variant="quiet" size="sm" icon="list" onclick={onsplit}>{over ? 'Split into posts that fit' : 'Thread the full text'}</Button>{/if}
		{#if canAdd}<Button variant="quiet" size="sm" icon="plus" onclick={add}>Add post</Button>{/if}
	</div>
{/if}

<style>
	.thread-composer { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
	.post { display: grid; grid-template-columns: minmax(0, 1fr); }
	.thread .post { grid-template-columns: 1.5rem minmax(0, 1fr); column-gap: var(--space-3); }
	.rail { display: flex; flex-direction: column; align-items: center; }
	.number { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 1px solid var(--border); border-radius: var(--radius-full); color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; line-height: 1; }
	/* The same line SocialPost draws between posts of a thread. */
	.connected .rail::after { content: ''; flex: 1; width: 2px; margin-top: var(--space-1); border-radius: 1px; background: var(--border); }
	.main { min-width: 0; }
	.connected .main { padding-bottom: var(--space-3); }
	.body { box-sizing: border-box; width: 100%; min-height: 6rem; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: var(--fs-lg); line-height: var(--lh-normal); resize: none; outline: none; field-sizing: content; }
	.thread .body { min-height: 3rem; }
	.body::placeholder { color: var(--text-muted); opacity: 1; }
	.meta { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-1); min-height: 1.75rem; }
	.count { color: var(--text-muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
	.count.over { color: var(--text-primary); text-decoration: underline wavy; font-weight: var(--fw-semibold); }
	.actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
	.thread + .actions { padding-left: calc(1.5rem + var(--space-3)); }
</style>
