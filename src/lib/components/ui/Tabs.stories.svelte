<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button, Row, RowList, Section, Tabs } from '.';

	const tabs = [
		{ value: 'tools', label: 'Tools' },
		{ value: 'connections', label: 'Connections', note: '2' },
		{ value: 'newsletter', label: 'Newsletter' },
		{ value: 'security', label: 'Security' }
	];
	const { Story } = defineMeta({ title: 'Primitives/Tabs', component: Tabs, tags: ['!autodocs'] });
</script>

{#snippet panel(value: string)}
	<Section title={tabs.find((tab) => tab.value === value)?.label ?? value}>
		<p>What belongs to this group, and nothing else.</p>
		<RowList>
			<Row title="A setting" detail="What it is set to">{#snippet action()}<Button size="sm">Change</Button>{/snippet}</Row>
			<Row title="Another setting" detail="What it is set to" />
		</RowList>
	</Section>
{/snippet}

<!-- A page of settings: the list stands beside the panels where there is room. Arrow keys move between tabs. -->
<Story asChild name="Beside">
	<div style="max-width: 48rem"><Tabs {tabs} label="Account settings" {panel} /></div>
</Story>

<!-- Under 640px of room, measured on the tabs themselves so a docked side panel counts, the list becomes a row that wraps. -->
<Story asChild name="Narrow">
	<div style="max-width: 22rem"><Tabs {tabs} label="Account settings" value="connections" {panel} /></div>
</Story>

<Story asChild name="Always on top">
	<div style="max-width: 48rem"><Tabs {tabs} label="Account settings" placement="top" {panel} /></div>
</Story>
