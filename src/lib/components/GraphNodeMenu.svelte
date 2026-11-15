<script module lang="ts">
	/** What was right-clicked in the homepage graph. */
	export type GraphMenuTarget =
		| { kind: 'url'; topic: string; url: string; title?: string; cited_text?: string | null; pinned: boolean }
		| { kind: 'topic'; topic: string };

	export interface GraphMenuHandlers {
		onPin: (topic: string, url: string) => Promise<unknown> | unknown;
		onUnpin: (topic: string, url: string) => Promise<unknown> | unknown;
		onBlockUrl: (url: string) => Promise<unknown> | unknown;
		onBlockDomain: (url: string) => Promise<unknown> | unknown;
		/** Rejects with a message to show beside the field. */
		onAttach: (topic: string, url: string) => Promise<unknown>;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import ContextMenu, { type ContextMenuItem, type ContextMenuPoint } from './ui/ContextMenu.svelte';
	import Popover from './ui/Popover.svelte';
	import TextField from './ui/TextField.svelte';
	import Button from './ui/Button.svelte';
	import Notice from './ui/Notice.svelte';
	import { domainOf, httpUrl } from '$lib/graph-curation';

	interface Props extends GraphMenuHandlers {
		/** Added to each confirmation, such as that a preview doesn't save changes. */
		note?: string;
	}

	let { onPin, onUnpin, onBlockUrl, onBlockDomain, onAttach, note }: Props = $props();

	let menu: ContextMenu;
	let target = $state<GraphMenuTarget | null>(null);
	let point = $state<ContextMenuPoint | null>(null);
	let attachOpen = $state(false);
	let attachUrl = $state('');
	let attachError = $state('');
	let attaching = $state(false);
	let status = $state<{ tone: 'info' | 'error'; text: string } | null>(null);
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	function say(tone: 'info' | 'error', text: string) {
		clearTimeout(statusTimer);
		status = { tone, text };
		statusTimer = setTimeout(() => (status = null), tone === 'error' ? 6000 : 3000);
	}

	async function run(done: string, action: () => unknown) {
		try {
			await action();
			say('info', note ? `${done} ${note}` : done);
		} catch (cause) {
			say('error', cause instanceof Error ? cause.message : 'That change wasn’t saved.');
		}
	}

	const items = $derived.by<ContextMenuItem[]>(() => {
		if (!target) return [];
		if (target.kind === 'topic') return [{ value: 'attach', label: 'Attach a link…', hint: 'Fetched now and always shown here' }];
		const domain = domainOf(target.url) ?? target.url;
		return [
			target.pinned
				? { value: 'unpin', label: 'Stop always showing', hint: `Under ${target.topic}` }
				: { value: 'pin', label: 'Always show', hint: `Keep under ${target.topic}` },
			{ value: 'block-url', label: 'Never show this link', destructive: true },
			{ value: 'block-domain', label: `Never show ${domain}`, hint: 'Hides every link from this site', destructive: true }
		];
	});

	const title = $derived(target ? (target.kind === 'url' ? domainOf(target.url) ?? target.url : target.topic) : undefined);

	/** Opens the menu for a node at a point in the viewport. */
	export function open(next: GraphMenuTarget, at: ContextMenuPoint) {
		target = next;
		point = at;
		attachOpen = false;
		void tick().then(() => menu.openAt(at));
	}

	async function onAction(value: string) {
		const current = target;
		if (!current) return;
		if (current.kind === 'topic') {
			if (value === 'attach') {
				attachUrl = '';
				attachError = '';
				await tick();
				attachOpen = true;
			}
			return;
		}
		const domain = domainOf(current.url) ?? current.url;
		if (value === 'pin') return run(`Always showing this link under ${current.topic}.`, () => onPin(current.topic, current.url));
		if (value === 'unpin') return run(`No longer always showing this link.`, () => onUnpin(current.topic, current.url));
		if (value === 'block-url') return run('This link won’t be shown again.', () => onBlockUrl(current.url));
		if (value === 'block-domain') return run(`Nothing from ${domain} will be shown again.`, () => onBlockDomain(current.url));
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!target || target.kind !== 'topic' || attaching) return;
		const raw = attachUrl.trim();
		const url = httpUrl(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
		if (!url) {
			attachError = 'Enter a web address, like example.com/page.';
			return;
		}
		attaching = true;
		attachError = '';
		try {
			await onAttach(target.topic, url);
			attachOpen = false;
			say('info', note ? `Attached to ${target.topic}. ${note}` : `Attached to ${target.topic}.`);
		} catch (cause) {
			attachError = cause instanceof Error ? cause.message : 'That link couldn’t be attached.';
		} finally {
			attaching = false;
		}
	}
</script>

<ContextMenu bind:this={menu} {items} {title} {onAction} />

<Popover bind:open={attachOpen} anchor={point} label={target ? `Attach a link to ${target.topic}` : 'Attach a link'} hideTitle={false} panelClass="graph-attach">
	<form onsubmit={submit} novalidate>
		<TextField label="Link" bind:value={attachUrl} inputmode="url" placeholder="https://" autocomplete="off" required hint="Fetched now and shown under this topic from now on." />
		{#if attachError}<Notice tone="error">{attachError}</Notice>{/if}
		<div class="graph-attach-actions">
			<Button variant="quiet" size="sm" onclick={() => (attachOpen = false)}>Cancel</Button>
			<Button variant="primary" size="sm" type="submit" disabled={attaching}>{attaching ? 'Fetching…' : 'Attach'}</Button>
		</div>
	</form>
</Popover>

{#if status}
	<div class="graph-menu-status"><Notice tone={status.tone}>{status.text}</Notice></div>
{/if}

<style>
	.graph-menu-status {
		position: fixed;
		bottom: var(--space-4);
		left: 50%;
		z-index: 10;
		width: max-content;
		max-width: calc(100vw - 2 * var(--space-4));
		transform: translateX(-50%);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
	}

	.graph-menu-status :global(.notice) {
		margin: 0;
		background: var(--bg-primary);
	}

	:global(.graph-attach) {
		width: min(22rem, calc(100vw - 2 * var(--space-4)));
		padding: var(--space-2) var(--space-3);
	}

	form :global(.text-field) {
		margin-top: 0;
	}

	.graph-attach-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}
</style>
