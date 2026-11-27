<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { SourcesState, SourceStatus } from '$lib/source-status';
	import SourceCache from './SourceCache.svelte';

	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 400));
	const source = (id: string, name: string, icon: string, over: Partial<SourceStatus> = {}): SourceStatus => ({ source: id, name, icon, configured: true, documents: 0, private: 0, highlights: 0, withText: 0, syncing: false, everything: false, ...over });
	const synced = '2026-11-27T19:04:00Z';
	const full: SourcesState = { available: true, sources: [
		source('readwise', 'Readwise', '📖', { documents: 11596, private: 11596, highlights: 1033, withText: 11420, synced, everything: true }),
		source('raindrop', 'Raindrop', '💧', { documents: 2140, private: 2140, highlights: 36, withText: 1875, synced, everything: true }),
		source('arena', 'Are.na', '◼︎', { documents: 1208, private: 242, withText: 809, synced, everything: true })
	] };
	const first: SourcesState = { available: true, sources: [
		source('readwise', 'Readwise', '📖', { documents: 5899, private: 5899, withText: 5810, syncing: true }),
		source('raindrop', 'Raindrop', '💧', { configured: false }),
		source('arena', 'Are.na', '◼︎', { documents: 1208, private: 242, withText: 809, synced, everything: true })
	] };
	const empty: SourcesState = { available: true, sources: full.sources.map((one) => source(one.source, one.name, one.icon)) };

	const { Story } = defineMeta({ title: 'Site/SourceCache', component: SourceCache, parameters: { docs: { story: { height: '360px' } } } });
</script>

<!-- On /account under Connections, for the signed-in owner: the site's own copy of each source. -->
<Story name="Up to date" args={{ load: later(full), sync: later(full) }} />

<!-- A first copy of Readwise under way, and Raindrop without its token. -->
<Story name="First copy under way" args={{ load: later(first), sync: later(first) }} />

<!-- A preview that has never synced: nothing until “Sync now”. -->
<Story name="Nothing yet" args={{ load: later(empty), sync: later(first) }} />

<!-- The dev server, where there is no Worker to hold the copy. -->
<Story name="Not available" args={{ load: later({ available: false, sources: [] }) }} />
