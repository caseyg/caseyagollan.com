<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({ title: 'Site/Live cursors', tags: ['!autodocs'] });
</script>

<script lang="ts">
	import CursorPointer from './CursorPointer.svelte';
	import { CURSOR_COLORS, CHAT_MAX_LENGTH, type Cursor } from '$lib/cursors';
	import CursorChatField from './CursorChatField.svelte';
	import CursorLayer from './CursorLayer.svelte';
	import PresenceButton from './PresenceButton.svelte';

	const room: Record<string, Cursor> = {
		a: { color: CURSOR_COLORS[0], country: 'US', position: { x: 0.18, y: 120 } },
		b: { color: CURSOR_COLORS[2], country: 'DE', position: { x: 0.42, y: 260 }, message: 'love this library graph' },
		c: { color: CURSOR_COLORS[4], position: { x: 0.68, y: 90 }, message: 'hi Casey 👋' },
		d: { color: CURSOR_COLORS[5], country: 'JP', position: { x: 0.95, y: 200 }, message: 'near the edge, so the bubble flips' },
		e: { color: CURSOR_COLORS[1], country: 'BR' }
	};
	const long = 'x'.repeat(CHAT_MAX_LENGTH).replace(/x/g, (_, i) => (i % 6 === 5 ? ' ' : 'w'));
	let width = $state(800);
</script>

{#snippet emptyField()}
	<CursorChatField />
{/snippet}

{#snippet field()}
	<CursorChatField value="typing by my own cursor" />
{/snippet}

<Story name="Pointers">
	<div class="grid">
		{#each CURSOR_COLORS as color (color)}
			<div class="cell"><CursorPointer {color} country="US" /></div>
		{/each}
	</div>
	<div class="grid">
		{#each CURSOR_COLORS as color (color)}
			<div class="cell cell--tall"><CursorPointer {color} message="hello" /></div>
		{/each}
	</div>
</Story>

<Story name="Chat bubbles">
	<div class="stack">
		<div class="cell cell--wide"><CursorPointer color={CURSOR_COLORS[0]} message="Short" /></div>
		<div class="cell cell--wide"><CursorPointer color={CURSOR_COLORS[3]} message={long} /></div>
		<div class="cell cell--wide"><CursorPointer color={CURSOR_COLORS[6]} message="Without a flag" /></div>
		<div class="cell cell--wide"><CursorPointer color={CURSOR_COLORS[7]} {field} bubbleOnly /></div>
		<div class="cell cell--wide"><CursorPointer color={CURSOR_COLORS[2]} field={emptyField} bubbleOnly /></div>
		<div class="cell cell--wide flip"><CursorPointer color={CURSOR_COLORS[5]} message="Flipped left and up" flipX flipY /></div>
	</div>
</Story>

<Story name="Room">
	<div class="room" bind:clientWidth={width}>
		<p>Five other visitors: four moving (one off the window, so hidden), two talking, one by the right edge.</p>
		<CursorLayer cursors={room} {width} still self={{ x: 220, y: 420, color: CURSOR_COLORS[6] }} selfField={field} />
		<PresenceButton others={5} canChat />
	</div>
</Story>

<Story name="Presence button">
	<div class="stack">
		<PresenceButton others={1} canChat floating={false} />
		<PresenceButton others={12} canChat floating={false} />
		<!-- A touch screen sees others but has no cursor to chat by. -->
		<PresenceButton others={3} floating={false} />
	</div>
</Story>

<style>
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5);
		margin-bottom: var(--space-6);
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
	}

	.cell {
		width: 3rem;
		height: 2.5rem;
	}

	.cell--tall {
		width: 5rem;
		height: 3.5rem;
	}

	.cell--wide {
		width: 24rem;
		height: 3.5rem;
	}

	.flip {
		display: flex;
		justify-content: flex-end;
		align-items: flex-end;
	}

	.room {
		min-height: 100vh;
		font-size: var(--fs-base);
	}
</style>
