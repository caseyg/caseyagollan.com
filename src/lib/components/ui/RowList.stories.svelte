<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button, Row, RowList } from '.';

	const { Story } = defineMeta({ title: 'Primitives/RowList', component: RowList, tags: ['!autodocs'] });
</script>

<!-- Things with one line each and at most one action. -->
<Story asChild name="With actions">
	<RowList label="Passkeys">
		<Row title="Passkey" detail="Added Nov 2, 2026, 9:14 AM · Backed up">{#snippet action()}<Button size="sm">Remove</Button>{/snippet}</Row>
		<Row title="Passkey" detail="Added Nov 18, 2026, 4:02 PM">{#snippet action()}<Button size="sm">Remove</Button>{/snippet}</Row>
	</RowList>
</Story>

<!-- A row with `href` is one link, with an arrow that leans on hover. -->
<Story asChild name="Links">
	<RowList label="Tools">
		<Row href="/new/" title="Write a new post" detail="Notes, articles, photos, replies and the rest." />
		<Row href="/readwise" title="Review Readwise bookmarks" detail="Choose which saved links become bookmark posts." />
	</RowList>
</Story>

<Story asChild name="Long content">
	<div style="max-width: 20rem">
		<RowList>
			<Row title="https://claude-project-thread-s3cflt-caseyagollan.caseygollan.workers.dev/" detail="create update media · Created Nov 2, 2026, 9:14 AM · Expires Dec 2, 2026, 9:14 AM">{#snippet action()}<Button size="sm">Revoke</Button>{/snippet}</Row>
		</RowList>
	</div>
</Story>
