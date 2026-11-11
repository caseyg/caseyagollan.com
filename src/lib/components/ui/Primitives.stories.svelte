<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Avatar, BackLink, Button, Checkbox, Chip, Count, Heading, Notice, Pagination, Prose, Section, TextField } from '.';

	const noop = () => undefined;
	const { Story } = defineMeta({ title: 'Primitives/Overview', tags: ['!autodocs'] });
</script>

<Story name="Heading">
	<div class="stack">
		<Heading as="p" size="label">Label · overline</Heading>
		<Heading level={1} size="display">Display: a standalone page</Heading>
		<Heading level={1} size="title">Title: a post on its own page</Heading>
		<Heading level={2} size="section">Section: a part of a page</Heading>
		<Heading level={3} size="subtitle">Subtitle: a post within a feed</Heading>
	</div>
</Story>

<Story name="Button">
	<div class="stack">
		<div class="row">
			<Button variant="primary">Send selected posts</Button>
			<Button>Add passkey</Button>
			<Button variant="quiet">Cancel</Button>
			<Button disabled>Unavailable</Button>
		</div>
		<div class="row">
			<Button size="sm" variant="primary">Import selected · 3</Button>
			<Button size="sm">Dismiss</Button>
			<Button size="sm" variant="quiet" href="/posts/">Read more →</Button>
		</div>
	</div>
</Story>

<Story name="Chip">
	<div class="stack">
		<div class="row muted">
			<Chip href="/type/notes/">📝 note</Chip>
			<Chip href="/2026/01/10/storybook-note/">3 days ago</Chip>
			<Chip href="/tag/design/" active>#Design</Chip>
			<Chip href="/tag/research/">#Research</Chip>
		</div>
		<div class="row">
			<Chip href="/tag/design/" variant="soft" size="sm" active>Design</Chip>
			<Chip href="/tag/research/" variant="soft" size="sm">Research</Chip>
			<Chip variant="soft" onclick={noop}>Removable ×</Chip>
		</div>
	</div>
</Story>

<Story name="CountAndAvatar">
	<div class="row">
		<Count value={128} />
		<Count value={3} />
		<Avatar src="/author-avatar.webp" name="Casey Gollan" />
		<Avatar name="Example reader" />
		<Avatar name="Example reader" size="sm" />
	</div>
</Story>

<Story name="BackLink">
	<BackLink href="/posts/">All Posts</BackLink>
</Story>

<Story name="Notice">
	<Notice>Syndication links were saved to the original post.</Notice>
	<Notice tone="error">Your sign-in has expired. <a href="/account">Sign in again</a> to continue.</Notice>
</Story>

<Story name="FormControls">
	<div class="form">
		<TextField label="Setup token" type="password" hint="Provided by your site operator." />
		<TextField label="Draft · maximum 300 characters" multiline value="A small observation about design, technology, and working together." />
		<TextField label="Access token" mono multiline readonly value="cg_pat_8f2e…41ab" />
		<Checkbox checked><strong>create</strong> — Create posts.</Checkbox>
		<Checkbox><strong>media</strong> — Upload images and other media.</Checkbox>
		<Checkbox disabled><strong>delete</strong> — Delete posts.</Checkbox>
	</div>
</Story>

<Story name="Section">
	<div class="form">
		<Section title="Passkeys">
			<p>Keep a second passkey so you can sign in if a device is unavailable.</p>
			<Button>Add passkey</Button>
		</Section>
		<Section title="Bluesky" variant="card">
			<p>This destination is not configured yet.</p>
		</Section>
	</div>
</Story>

<Story name="Pagination">
	<div class="form">
		<Pagination page={2} totalPages={14} prevHref="/posts" nextHref="/posts/page/3" />
		<Pagination page={1} totalPages={14} nextHref="/posts/page/2" />
	</div>
</Story>

<Story name="Prose">
	<div class="form">
		<Prose>
			<p>Long-form copy sets at a relaxed line height with <a href="/posts/">quiet underlines</a> that firm up on hover, <strong>semibold emphasis</strong>, and <code>inline code</code>.</p>
			<h2>Start with curiosity</h2>
			<p>Try something small, learn from it, and share what you find.</p>
			<blockquote><p>Quotations step back a little and lean.</p></blockquote>
			<ul><li>Lists keep their markers muted</li><li>so the words lead.</li></ul>
			<pre><code>bun run storybook</code></pre>
		</Prose>
	</div>
</Story>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.muted {
		color: var(--text-muted);
	}

	.form {
		max-width: var(--measure);
	}
</style>
