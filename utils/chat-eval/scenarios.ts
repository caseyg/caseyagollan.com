/** Questions Casey has asked the chat, with what a good run of each looks like. */
import type { FakeItem } from './fake-table';

interface Seen { answer: string; calls: { name: string; args: string; error?: boolean }[]; went: string[]; items: FakeItem[] }
export interface Scenario { name: string; ask: string; page?: string; pageTitle?: string; table?: FakeItem[]; checks: { name: string; pass(seen: Seen): unknown }[] }

const used = (seen: Seen, name: RegExp) => seen.calls.filter((call) => name.test(call.name)).length;

export const SCENARIOS: Scenario[] = [
	{
		// https://caseyagollan.com/chat/7agbgpwcka: 18 tool calls over 94 seconds, then "it took too many steps".
		name: 'whats-new',
		ask: 'What’s new this week?',
		page: '/chat',
		checks: [
			{ name: 'answers', pass: (seen) => seen.answer.length > 80 },
			{ name: 'names something from the week (the paperwork repost, the calm technology channels, a like)', pass: (seen) => /paperwork|seaver|calm tech|kissane|carmody|charlie loyd/i.test(seen.answer) },
			{ name: 'links to the site', pass: (seen) => /caseyagollan\.com\/2026\/11\/|\]\(\/2026\/11\//.test(seen.answer) },
			{ name: 'no admin tools for a reading question', pass: (seen) => !used(seen, /^micropub_/) },
			{ name: 'four tool calls or fewer', pass: (seen) => seen.calls.length <= 4 }
		]
	},
	{
		name: 'go-to-notes',
		ask: 'Take me to my notes',
		page: '/',
		checks: [
			{ name: 'goes to /type/notes', pass: (seen) => seen.went.some((path) => /^\/type\/notes\/?$/.test(path)) },
			{ name: 'one call', pass: (seen) => seen.calls.length === 1 }
		]
	},
	{
		name: 'this-page',
		ask: 'Summarize this in two sentences.',
		page: '/2026/11/17/writing-again/',
		pageTitle: 'Note · 2026-11-17',
		checks: [
			{ name: 'reads the page', pass: (seen) => used(seen, /^fetch_page$/) >= 1 },
			{ name: 'says what the note says', pass: (seen) => /indieweb|micropub|night kitchen|public study/i.test(seen.answer) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'find-topic',
		ask: 'What have I saved or written about calm technology?',
		page: '/',
		checks: [
			{ name: 'searches', pass: (seen) => used(seen, /^search_site$/) >= 1 },
			{ name: 'finds the Are.na channels', pass: (seen) => /calm technolog/i.test(seen.answer) && /are\.na/i.test(seen.answer) },
			{ name: 'four calls or fewer', pass: (seen) => seen.calls.length <= 4 }
		]
	},
	{
		name: 'drafts',
		ask: 'Do I have any drafts sitting around?',
		page: '/',
		checks: [
			{ name: 'asks the publishing system', pass: (seen) => used(seen, /^micropub_list_posts$/) >= 1 },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		// The canvas case behind PRs 232 and 239: a grid of notes used to take a call per note.
		name: 'table-grid',
		ask: 'Put a comparison of Micropub, POSSE and PESOS on here: for each, what it is and who starts the post.',
		page: '/tables/evaltable1',
		pageTitle: 'IndieWeb',
		table: [],
		checks: [
			{ name: 'puts at least six things on the table', pass: (seen) => seen.items.filter((item) => item.type === 'note' || item.type === 'text').length >= 6 },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'no Markdown table pasted instead', pass: (seen) => !/\|\s*-{3,}/.test(seen.answer) },
			{ name: 'five calls or fewer', pass: (seen) => seen.calls.length <= 5 },
			{ name: 'reads the table at most once', pass: (seen) => used(seen, /^table_read$/) <= 1 }
		]
	},
	{
		name: 'table-fill',
		ask: 'Add what I’ve saved on Are.na about Pauline Oliveros, and connect each one to this note.',
		page: '/tables/evaltable1',
		pageTitle: 'Listening',
		table: [{ id: 'n1', type: 'note', text: 'Deep listening', x: 0, y: 0, w: 200, h: 200 }],
		checks: [
			{ name: 'adds at least three blocks', pass: (seen) => seen.items.filter((item) => item.url).length >= 3 },
			{ name: 'draws an arrow between the note and each block', pass: (seen) => seen.items.filter((item) => item.url).every((block) => seen.items.some((item) => item.type === 'arrow' && [item.from, item.to].includes('n1') && [item.from, item.to].includes(block.id))) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'five calls or fewer', pass: (seen) => seen.calls.length <= 5 }
		]
	},
	{
		// Casey's ask on the home page notes table (chat dm2wwyw4rf): eight searches, then the answer stopped with an error.
		name: 'table-illustrate',
		ask: 'Illustrate each part with images/links from my site connected with arrows',
		page: '/tables/evaltable1',
		pageTitle: 'Home page notes',
		table: [
			{ id: 'n1', type: 'note', text: 'Recently shipped: agents for product teams, a dashboard tracking 70+ product strategy metrics, and a research library connecting 1,000+ UX insights to roadmaps.', x: 0, y: 0, w: 240, h: 200 },
			{ id: 'n2', type: 'note', text: 'Outside work: knowledge gardening in Obsidian, writing personal software, reading about alternative organizing and technology critique.', x: 0, y: 240, w: 240, h: 200 },
			{ id: 'n3', type: 'note', text: 'Open platforms: writing and speaking about the need for interoperable systems in enterprise product development.', x: 280, y: 0, w: 240, h: 200 },
			{ id: 'n4', type: 'note', text: 'Local-first, decentralized, and indieweb software: Obsidian, IndieKit, prototyping Otso.', x: 280, y: 240, w: 240, h: 200 },
			{ id: 'n5', type: 'note', text: 'Operations as design: advocating for the invisible work behind the work.', x: 280, y: 480, w: 240, h: 200 }
		],
		checks: [
			{ name: 'answers', pass: (seen) => seen.answer.length > 40 },
			{ name: 'adds at least three blocks', pass: (seen) => seen.items.filter((item) => item.url).length >= 3 },
			{ name: 'draws at least three arrows', pass: (seen) => seen.items.filter((item) => item.type === 'arrow').length >= 3 },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) }
		]
	},
	{
		// Casey's ask on the “Are.na — calm technology” table: site search only matched the channels themselves, so the chat added loosely related search hits instead.
		name: 'arena-channels-to-table',
		ask: 'Pull all the blocks from my Are.na channels Calm Technology Research and Index of Calm Technologies onto this table.',
		page: '/tables/evaltable1',
		pageTitle: 'Are.na — calm technology',
		table: [
			{ id: 'c1', type: 'arena', title: 'Calm Technology Research', url: 'https://www.are.na/casey-gollan/calm-technology-research', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'c2', type: 'arena', title: 'Index of Calm Technologies', url: 'https://www.are.na/casey-gollan/index-of-calm-technologies', x: 260, y: 0, w: 240, h: 240 }
		],
		checks: [
			{ name: 'puts both channels’ blocks on the table (at least 80)', pass: (seen) => seen.items.filter((item) => item.url).length >= 80 },
			{ name: 'a frame for each channel, named after it', pass: (seen) => ['Calm Technology Research', 'Index of Calm Technologies'].every((name) => seen.items.some((item) => item.type === 'frame' && item.text === name)) },
			{ name: 'every new block sits in a frame', pass: (seen) => seen.items.filter((item) => item.url && !['c1', 'c2'].includes(item.id)).every((block) => seen.items.some((frame) => frame.type === 'frame' && block.x >= frame.x && block.y >= frame.y && block.x + block.w <= frame.x + frame.w && block.y + block.h <= frame.y + frame.h)) },
			{ name: 'no search results standing in for the channels', pass: (seen) => !seen.calls.some((call) => call.name === 'table_add' && /"search"\s*:\s*"[^"]/.test(call.args)) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'arena-channel-contents',
		ask: 'What’s in my Calm Technology Research channel on Are.na? Just the highlights.',
		page: '/',
		checks: [
			{ name: 'lists the channel, not a search', pass: (seen) => seen.calls.some((call) => call.name === 'my_saves' && /calm/i.test(call.args) && !call.error) },
			{ name: 'names things that are in it', pass: (seen) => /weiser|daylight|calm tech certified|amber case|principles and patterns/i.test(seen.answer) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		// Needs READWISE_ACCESS_TOKEN; without it the chat should say Readwise isn't connected.
		name: 'readwise-highlights',
		ask: 'What did I highlight in Living With Complexity?',
		page: '/',
		checks: [
			{ name: 'asks Readwise for the book', pass: (seen) => seen.calls.some((call) => call.name === 'my_saves' && /readwise/i.test(call.args)) },
			{ name: 'quotes a highlight, or says Readwise isn’t connected', pass: (seen) => /signs or labels|psychological task|forcing function|complexity|isn’t connected|not connected/i.test(seen.answer) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'new-table',
		ask: 'Make a new table called Calm tech and put my calm technology Are.na channels on it.',
		page: '/tables',
		checks: [
			{ name: 'makes the table', pass: (seen) => used(seen, /^(create_table|table_new)$/) === 1 },
			{ name: 'puts blocks on it', pass: (seen) => seen.calls.some((call) => /^table_add/.test(call.name) && !call.error) },
			{ name: 'four calls or fewer', pass: (seen) => seen.calls.length <= 4 }
		]
	}
];

function overlaps(items: FakeItem[]): boolean {
	const solid = items.filter((item) => item.type !== 'arrow' && item.type !== 'frame' && item.type !== 'draw');
	return solid.some((a, index) => solid.slice(index + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
}
