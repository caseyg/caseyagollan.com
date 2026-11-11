<script lang="ts">
	/** Living reference for the tokens in `src/app.css`. Values are read from the page, so this never drifts. */
	let { section }: { section: 'color' | 'type' | 'space' } = $props();

	const colors = [
		['--bg-primary', 'Ground. The whole site sits on one flat gray.'],
		['--accent', 'Actions, selection, and the current item.'],
		['--accent-hover', 'Hover and pressed state of anything blue.'],
		['--text-primary', 'Body copy, titles, and anything interactive.'],
		['--text-secondary', 'Summaries and supporting copy.'],
		['--text-muted', 'Metadata, captions, hints.'],
		['--surface-1', 'Resting fill for tags and callouts.'],
		['--surface-2', 'Hover fill on quiet controls.'],
		['--surface-3', 'Selected quiet controls, count badges.'],
		['--surface-sunken', 'Inputs, code blocks, error callouts.'],
		['--border-subtle', 'Hairlines between items in a list.'],
		['--border', 'Card outlines and section rules.'],
		['--border-strong', 'Inputs, secondary buttons, quote bars.']
	];

	const sizes = [
		['--fs-3xl', 'Display', 'Standalone page titles'],
		['--fs-2xl', 'Title', 'A post on its own page'],
		['--fs-xl', 'Section', 'Page sections, headings in prose'],
		['--fs-lg', 'Subtitle', 'Post titles in a feed, pills'],
		['--fs-md', 'Reading', 'Post body at desktop widths'],
		['--fs-base', 'Base', 'Cards, forms, body on small screens'],
		['--fs-sm', 'Small', 'Captions, back links, hints'],
		['--fs-xs', 'Meta', 'Post metadata, date pills, counts'],
		['--fs-2xs', 'Micro', 'Dense admin views only']
	];

	const weights = [
		['100', 'Thin', 'Homepage telescopic text'],
		['--fw-light', 'Light', 'Homepage long-form sections'],
		['--fw-regular', 'Regular', 'Body copy, display titles'],
		['--fw-medium', 'Medium', 'Pills, buttons, section headings'],
		['--fw-semibold', 'Semibold', 'Post titles, names, strong']
	];

	const spaces = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7'];

	const radii = [
		['--radius-none', 'Site chrome: nav, search'],
		['--radius-sm', 'Pills, chips, buttons, inputs, media'],
		['--radius-md', 'Images and previews inside cards'],
		['--radius-lg', 'Cards'],
		['--radius-full', 'Avatars, count badges']
	];

	let resolved: Record<string, string> = $state({});
	$effect(() => {
		const style = getComputedStyle(document.documentElement);
		const names = [...colors, ...sizes, ...weights, ...radii].map(([name]) => name).concat(spaces);
		resolved = Object.fromEntries(names.filter((n) => n.startsWith('--')).map((n) => [n, style.getPropertyValue(n).trim()]));
	});
</script>

<div class="foundations">
	{#if section === 'color'}
		<p class="intro">Three ideas: a gray ground, white ink at three strengths, and one blue reserved for things you can act on. Everything else is white or black at low opacity, so it stays in key with the ground.</p>
		<ul class="swatches">
			{#each colors as [name, use] (name)}
				<li>
					<span class="swatch" style:background="var({name})"></span>
					<span><code>{name}</code><small>{resolved[name]}</small></span>
					<span class="use">{use}</span>
				</li>
			{/each}
		</ul>
	{:else if section === 'type'}
		<p class="intro">One family, FF Dagny, across a nine-step scale. Size and weight carry hierarchy; color only steps down for metadata. Large sizes tighten slightly, small uppercase labels open up, and numerals are tabular wherever they line up in columns.</p>
		<ul class="scale">
			{#each sizes as [name, label, use] (name)}
				<li>
					<span class="sample" style:font-size="var({name})">{label}</span>
					<span><code>{name}</code><small>{resolved[name]}</small></span>
					<span class="use">{use}</span>
				</li>
			{/each}
		</ul>
		<ul class="scale">
			{#each weights as [name, label, use] (name)}
				<li>
					<span class="sample" style:font-size="var(--fs-xl)" style:font-weight={name.startsWith('--') ? `var(${name})` : name}>{label}</span>
					<span><code>{name}</code><small>{resolved[name] ?? ''}</small></span>
					<span class="use">{use}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="intro">Spacing steps roughly double. Corners are square on site chrome, barely eased on inline controls, and round only on cards and avatars.</p>
		<ul class="scale">
			{#each spaces as name (name)}
				<li>
					<span class="bar" style:width="var({name})"></span>
					<span><code>{name}</code><small>{resolved[name]}</small></span>
				</li>
			{/each}
		</ul>
		<ul class="radii">
			{#each radii as [name, use] (name)}
				<li>
					<span class="corner" style:border-radius="var({name})"></span>
					<code>{name}</code>
					<span class="use">{use}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.foundations {
		max-width: var(--measure-wide);
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
	}

	.intro {
		max-width: var(--measure);
		margin: 0 0 var(--space-6);
		font-size: var(--fs-md);
		text-wrap: pretty;
	}

	ul {
		margin: 0 0 var(--space-7);
		padding: 0;
		list-style: none;
	}

	.swatches li,
	.scale li {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr);
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--border-subtle);
	}

	.swatches li {
		grid-template-columns: 3rem minmax(0, 1fr) minmax(0, 1.4fr);
	}

	.swatch {
		width: 3rem;
		height: 3rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	code {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}

	small {
		display: block;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
	}

	.use {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
	}

	.sample {
		line-height: 1.2;
		overflow: hidden;
		white-space: nowrap;
	}

	.bar {
		height: var(--space-4);
		background: var(--accent);
	}

	.radii {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: var(--space-5);
	}

	.radii li {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.corner {
		width: 4rem;
		height: 4rem;
		border: 1px solid var(--border-strong);
		background: var(--surface-1);
	}
</style>
