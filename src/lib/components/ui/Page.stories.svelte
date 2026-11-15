<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button, Checkbox, Chip, Heading, Notice, Page, PageHeader, Section, TextField } from '.';
	import PostFeed from '../posts/PostFeed.svelte';
	import { note, article, bookmark } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Primitives/Page', component: Page, parameters: { layout: 'fullscreen' }, tags: ['!autodocs'] });
</script>

<Story asChild name="ReadingPage">
	<Page>
		<PageHeader
			title="Posts from January 2026"
			trail={[{ label: 'Posts', href: '/posts/', icon: '📡' }, { label: '2026', href: '/2026/' }, { label: '01', href: '/2026/01/', current: true, count: 3 }]}
		/>
		<PostFeed postsByDay={[['2026-01-10', [note, { ...article, slug: 'a' }]], ['2026-01-08', [{ ...bookmark, slug: 'b' }]]]} />
	</Page>
</Story>

<!-- A control for the whole page sits in the header row, clear of the pinned trail. -->
<Story asChild name="HeaderWithActions">
	<Page>
		<PageHeader title="Posts" trail={[{ label: 'Posts', href: '/posts/', icon: '📡', current: true, count: 128 }]}>
			{#snippet actions()}
				<Chip href="/posts/" variant="ghost">Filter by type</Chip>
			{/snippet}
		</PageHeader>
		<PostFeed postsByDay={[['2026-01-10', [note, { ...article, slug: 'a' }]]]} />
	</Page>
</Story>

<!-- A column beside the text on wide screens, after it on narrow ones: a wiki page's outline, graph and backlinks. -->
<Story asChild name="WithAside">
	<Page>
		<PageHeader trail={[{ label: 'Wiki', href: '/wiki/', icon: '📓' }, { label: 'Art Under Risk', href: '/wiki/art-under-risk', current: true }]} title="Art Under Risk" />
		<Heading level={1} size="title">Art Under Risk</Heading>
		<p>The text keeps its measure. Narrow the window and the aside moves below it.</p>
		{#snippet aside()}
			<Section title="On this page" level={3}><p>Interviews, Reading list, Presentations</p></Section>
		{/snippet}
	</Page>
</Story>

<Story asChild name="FormPage">
	<Page as="main" width="wide">
		<PageHeader trail={[{ label: 'Casey Gollan', href: '/', icon: '👋' }]} tight>
			<Heading level={1} size="display">Account</Heading>
		</PageHeader>
		<Notice>You are signed in.</Notice>
		<Section title="Passkeys">
			<p>Keep a second passkey so you can sign in if a device is unavailable.</p>
			<Button>Add passkey</Button>
		</Section>
		<Section title="Access tokens">
			<p>Tokens let apps act with the permissions you grant.</p>
			<Checkbox checked><strong>create</strong> — Create posts.</Checkbox>
			<Checkbox><strong>media</strong> — Upload images and other media.</Checkbox>
			<TextField label="Note" hint="Only you can see this." />
			<Button variant="primary">Create token</Button>
		</Section>
	</Page>
</Story>
