import type { Meta, StoryObj } from '@storybook/sveltekit';
import OnThisDay from './OnThisDay.svelte';
import { onThisDay } from '$lib/on-this-day';
import { article, bookmark, note, photo, unsavedLike } from '$lib/storybook/fixtures';
import type { Post } from '$lib/posts-types';

const on = (date: string, post: Post, slug: string): Post => ({ ...post, slug, date });

// Built with `onThisDay`, as the day pages do, from posts on November 18 across the years.
const posts = [
	on('2025-11-18T09:12:00-05:00', note, 'a'),
	on('2025-11-18T13:40:00-05:00', { ...photo, content: 'First snow on the roof garden.' }, 'b'),
	on('2023-11-18T20:05:00-05:00', article, 'c'),
	on('2021-11-18T08:00:00-05:00', bookmark, 'd'),
	on('2021-11-18T10:00:00-05:00', unsavedLike, 'e'),
	on('2021-11-18T11:00:00-05:00', { ...note, content: 'A much longer note that runs past one line, so the block shows how a long post is cut to two lines instead of pushing the rest of the list down the page.' }, 'f'),
	on('2021-11-18T12:00:00-05:00', note, 'g'),
	on('2021-11-18T15:00:00-05:00', note, 'h'),
	on('2019-11-18T18:30:00-05:00', note, 'i')
];

const meta = {
	title: 'Posts/OnThisDay',
	component: OnThisDay,
	parameters: { layout: 'padded' },
	args: { dateKey: '2026-11-18', years: onThisDay(posts, '2026-11-18') }
} satisfies Meta<typeof OnThisDay>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four earlier years; 2021 had five posts, so three show with a link to the rest. */
export const EarlierYears: Story = {};

/** Read from an older day page, other years come before and after it. */
export const BeforeAndAfter: Story = { args: { dateKey: '2023-11-18', years: onThisDay(posts, '2023-11-18') } };

/** One year with one post. */
export const OneYear: Story = { args: { years: onThisDay([posts[8]], '2026-11-18') } };

/** No other year has posts that day, so nothing renders. */
export const Empty: Story = { args: { years: [] } };

export const Phone: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
