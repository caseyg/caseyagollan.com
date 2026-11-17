import type { Meta, StoryObj } from '@storybook/sveltekit';
import MarkdownEditor from './MarkdownEditor.svelte';
const meta = { title: 'Components/MarkdownEditor', component: MarkdownEditor, args: { label: 'Content', value: '## Heading\n\nA paragraph with **bold**, *italic* and a [link](https://example.com/).\n\n- One\n- Two\n\n> A quote' } } satisfies Meta<typeof MarkdownEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { value: '' } };
export const Bare: Story = { args: { bare: true } };
/** Figures render as they do on the post, with the caption editable in place. They are written back as the same HTML. */
export const WithFigures: Story = {
	args: {
		value: '## Publishing\n\n<figure class="align-right narrow"><img src="/author-avatar.webp" alt="Casey\'s avatar"><figcaption>The composer opens <a href="/new/">straight into a note</a>.</figcaption></figure>\n\n- New post composer at `/new`, with every post type Quill offers.\n- Redesigned it around a single writing surface, like a social app\'s compose box.\n- Drafts are saved to a separate private GitHub repo.\n\nA paragraph that wraps beside the figure, the way it does on the published post.'
	}
};
/** A Markdown image on its own line shows as the image. Select it to edit its alt text; it is written back as `![alt](src)`. */
export const WithImage: Story = {
	args: {
		value: 'A paragraph before the image.\n\n![Casey in front of an ice cream cone sculpture](/author-avatar.webp)\n\nA paragraph after it.'
	}
};
/** A quote of several paragraphs, with a heading, a rule and a list inside, shows as one quote. Enter on its empty last line leaves it; Backspace at its start unquotes the first line. */
export const WithLongQuote: Story = {
	args: {
		value: "Here's the \"Not AI\" system prompt I got back:\n\n> Based on the Wikipedia page about AI writing patterns, here's a system prompt:\n>\n> ---\n>\n> ## Writing Style Instructions\n>\n> **Be specific, not symbolic.** State facts directly without inflating their importance.\n>\n> - Promotional language (breathtaking, must-see, nestled)\n> - Em dashes where commas or parentheses would work better\n\nI mean, it's not _wrong_. But it is melodramatic!"
	}
};
/** Italics that run across a link are written back as one run, `*The [shelves](…), by year.*`. */
export const WithItalicLinks: Story = {
	args: {
		value: '*The [recently acquired shelves](https://caseyagollan.com/library?view=shelves), with books grouped by year.*'
	}
};
