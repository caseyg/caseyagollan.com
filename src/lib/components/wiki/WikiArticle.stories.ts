import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiArticle from './WikiArticle.svelte';
import { sampleArticle, sampleWiki } from '$lib/storybook/wiki';

const meta = {
	title: 'Wiki/WikiArticle',
	component: WikiArticle,
	tags: ['autodocs'],
	args: { page: sampleArticle }
} satisfies Meta<typeof WikiArticle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A page with tags, a year, links to other pages, a heading's section embedded from another page, highlighted text and a footnote. */
export const Default: Story = {};

/** An image embedded from the vault's attachments. */
export const WithImage: Story = { args: { page: sampleWiki.bySlug.get('radical-actuarial-action')! } };

/** Links to pages that aren't published show as dotted text, as Obsidian shows them. */
export const UnpublishedLinks: Story = { args: { page: sampleWiki.bySlug.get('home')! } };

/** Dataview `key:: value` lines show as details under the title; %% comments stay hidden; links off the site open in a new tab, marked ↗. */
export const WithDetails: Story = { args: { page: sampleWiki.bySlug.get('nielsen-model-of-reops')! } };

/** The wiki's home page leaves its title to the trail. */
export const WithoutTitle: Story = { args: { page: sampleWiki.bySlug.get('home')!, showTitle: false } };

export const LongTitle: Story = {
	args: { page: { ...sampleArticle, title: 'Open Research Platforms: Towards an Ecosystem of Open and Interconnected Tools for Knowledge Work', tags: [], year: undefined } }
};
