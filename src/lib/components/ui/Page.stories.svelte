<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button, Checkbox, Heading, Notice, Page, PageHeader, Section, SegmentedPill, TextField } from '.';
	import PostFeed from '../posts/PostFeed.svelte';
	import { note, article, bookmark } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Primitives/Page', component: Page, parameters: { layout: 'fullscreen' }, tags: ['!autodocs'] });
</script>

<Story name="ReadingPage">
	<Page>
		<PageHeader backHref="/2026/" backText="2026">
			<SegmentedPill size="lg" label="Date archive" segments={[{ label: '2026', href: '/2026/' }, { label: '01', href: '/2026/01/', current: true, count: 3 }]} />
		</PageHeader>
		<PostFeed postsByDay={[['2026-01-10', [note, { ...article, slug: 'a' }]], ['2026-01-08', [{ ...bookmark, slug: 'b' }]]]} />
	</Page>
</Story>

<Story name="FormPage">
	<Page as="main" width="wide">
		<PageHeader backHref="/" backText="Casey Gollan" tight>
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
