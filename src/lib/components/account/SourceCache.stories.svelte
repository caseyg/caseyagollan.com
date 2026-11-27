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
		source('readwise', 'Readwise', '📖', { documents: 5899, private: 5899, withText: 5810, syncing: true, progress: { label: 'Archive', fraction: 0.58, done: 1901, total: 7598 }, waiting: '2099-01-01T00:00:00Z' }),
		source('raindrop', 'Raindrop', '💧', { configured: false }),
		source('arena', 'Are.na', '◼︎', { documents: 1208, private: 242, withText: 809, synced, everything: true })
	] };
	const empty: SourcesState = { available: true, sources: full.sources.map((one) => source(one.source, one.name, one.icon)) };

	/** A copy that gets a little further each time it is asked, as the real one does. */
	const live = () => {
		let asked = 0;
		return async (): Promise<SourcesState> => {
			const done = Math.min(asked++ * 400, 7598);
			return { available: true, sources: [
				source('readwise', 'Readwise', '📖', done >= 7598 ? { documents: 7598, private: 7598, withText: 7400, synced, everything: true } : { documents: done, private: done, withText: Math.round(done * 0.97), syncing: true, ...(asked > 2 ? { progress: { label: 'Archive', fraction: done / 7598, done, total: 7598 } } : {}) }),
				source('raindrop', 'Raindrop', '💧', { documents: 2140, private: 2140, withText: 1875, synced, everything: true }),
				source('arena', 'Are.na', '◼︎', asked > 8 ? { documents: 1208, private: 242, withText: 809, synced, everything: true } : { documents: asked * 100, syncing: true, progress: { label: 'Inside channels', fraction: 0.5 + asked / 18, done: asked * 5, total: 45 } })
			] };
		};
	};

	const { Story } = defineMeta({ title: 'Site/SourceCache', component: SourceCache, parameters: { docs: { story: { height: '360px' } } } });
</script>

<!-- On /account under Connections, for the signed-in owner: the site's own copy of each source. -->
<Story name="Up to date" args={{ load: later(full), sync: later(full) }} />

<!-- A first copy of Readwise under way, and Raindrop without its token. -->
<Story name="First copy under way" args={{ load: later(first), sync: later(first) }} />

<!-- Just asked for: the bars move on their own until the first page is in, then fill as the counts climb. -->
<Story name="Filling live" args={{ load: live(), sync: live() }} />

<!-- A preview that has never synced: nothing until “Sync now”. -->
<Story name="Nothing yet" args={{ load: later(empty), sync: later(first) }} />

<!-- The dev server, where there is no Worker to hold the copy. -->
<Story name="Not available" args={{ load: later({ available: false, sources: [] }) }} />
