/** Questions Casey has asked the chat, with what a good run of each looks like. */
import type { FakeItem } from './fake-table';

interface Seen { answer: string; calls: { name: string; args: string; error?: boolean }[]; went: string[]; items: FakeItem[] }
export interface Scenario { name: string; ask: string; page?: string; pageTitle?: string; table?: FakeItem[]; selected?: string[]; checks: { name: string; pass(seen: Seen): unknown }[] }

const used = (seen: Seen, name: RegExp) => seen.calls.filter((call) => name.test(call.name)).length;

/** Five things side by side, for the scenarios where Casey has some of them selected. */
const SELECTION_TABLE: FakeItem[] = [
	{ id: 'b1', type: 'post', title: 'Writing again', url: 'https://caseyagollan.com/2026/11/17/writing-again/', text: 'I want to write here more often, in public, in small pieces.', x: 0, y: 0, w: 240, h: 240 },
	{ id: 'b2', type: 'book', title: 'The Dispossessed', url: 'https://caseyagollan.com/library/9780061054884/', text: 'Ursula K. Le Guin. An ambiguous utopia: an anarchist moon and the planet it left.', x: 300, y: 0, w: 180, h: 300 },
	{ id: 'b3', type: 'post', title: 'Hirschhorn', url: 'https://caseyagollan.com/2026/11/17/hirschhorn/', text: 'Thomas Hirschhorn on energy yes, quality no.', x: 600, y: 0, w: 240, h: 240 },
	{ id: 'b4', type: 'book', title: 'Deep Listening', url: 'https://caseyagollan.com/library/9780595343652/', text: 'Pauline Oliveros. A composer’s sound practice: listening as attention to everything.', x: 900, y: 0, w: 180, h: 300 },
	{ id: 'n1', type: 'note', text: 'Attention as a practice', x: 300, y: 400, w: 200, h: 200 }
];

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
		// Casey's ask (2026-11-25): “pull in images and quotes” from blocks on a table, from chat.
		name: 'table-pull',
		ask: 'Pull in the images and quotes from these.',
		page: '/tables/evaltable1',
		pageTitle: 'Writing again',
		table: [
			{ id: 'b1', type: 'post', title: 'Writing again', url: 'https://caseyagollan.com/2026/11/17/writing-again/', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'post', title: 'Hirschhorn', url: 'https://caseyagollan.com/2026/11/17/hirschhorn/', x: 0, y: 600, w: 240, h: 240 }
		],
		selected: ['b1', 'b2'],
		checks: [
			{ name: 'uses table_pull', pass: (seen) => used(seen, /^table_pull$/) >= 1 },
			{ name: 'adds pieces taken from the blocks', pass: (seen) => seen.items.some((item) => item.type === 'quote' || item.type === 'image') },
			{ name: 'joins pieces to their block', pass: (seen) => seen.items.some((item) => item.type === 'arrow' && ['b1', 'b2'].includes(item.from ?? '')) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'table-pull-named',
		ask: 'Pull the quotes out of the Writing again post.',
		page: '/tables/evaltable1',
		pageTitle: 'Writing again',
		table: [
			{ id: 'b1', type: 'post', title: 'Writing again', url: 'https://caseyagollan.com/2026/11/17/writing-again/', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'post', title: 'Hirschhorn', url: 'https://caseyagollan.com/2026/11/17/hirschhorn/', x: 0, y: 600, w: 240, h: 240 }
		],
		checks: [
			{ name: 'pulls from Writing again only', pass: (seen) => seen.calls.some((call) => call.name === 'table_pull' && !call.error) && seen.items.filter((item) => item.type === 'arrow').every((arrow) => arrow.from === 'b1') },
			{ name: 'quotes only', pass: (seen) => seen.items.some((item) => item.type === 'quote') && !seen.items.some((item) => item.type === 'image') },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'table-pull-all',
		ask: 'Context pull the whole table.',
		page: '/tables/evaltable1',
		pageTitle: 'Writing again',
		table: [
			{ id: 'b1', type: 'post', title: 'Writing again', url: 'https://caseyagollan.com/2026/11/17/writing-again/', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'post', title: 'Hirschhorn', url: 'https://caseyagollan.com/2026/11/17/hirschhorn/', x: 0, y: 600, w: 240, h: 240 },
			{ id: 'n1', type: 'note', text: 'Why the site', x: 0, y: 1000, w: 200, h: 200 }
		],
		checks: [
			{ name: 'pulls from both blocks', pass: (seen) => ['b1', 'b2'].every((id) => seen.items.some((item) => item.type === 'arrow' && item.from === id)) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		// Casey points at three of five cards and says “these”: one change, on those three only, with no read first.
		name: 'selection-act',
		ask: 'Frame these as Reading and make the note green.',
		page: '/tables/evaltable1',
		pageTitle: 'Scratch',
		table: SELECTION_TABLE,
		selected: ['b2', 'b4', 'n1'],
		checks: [
			{ name: 'frames exactly the selection', pass: (seen) => { const frame = seen.items.find((item) => item.type === 'frame' && /reading/i.test(item.text ?? '')); return frame && ['b2', 'b4', 'n1'].every((id) => seen.items.find((item) => item.id === id)?.parent === frame.id) && !['b1', 'b3'].some((id) => seen.items.find((item) => item.id === id)?.parent); } },
			{ name: 'edits the selected note', pass: (seen) => seen.calls.some((call) => call.name === 'table_edit' && !call.error && /n1|selected/.test(call.args) && /green/.test(call.args)) },
			{ name: 'doesn’t read the whole table to find them', pass: (seen) => !seen.calls.some((call) => call.name === 'table_read' && !/ids/.test(call.args)) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'selection-summarize',
		ask: 'What do these have in common? One sentence.',
		page: '/tables/evaltable1',
		pageTitle: 'Scratch',
		table: SELECTION_TABLE,
		selected: ['b2', 'b4'],
		checks: [
			{ name: 'answers about the two selected', pass: (seen) => /le guin|dispossessed/i.test(seen.answer) && /oliveros|deep listening/i.test(seen.answer) },
			{ name: 'doesn’t bring in the others', pass: (seen) => !/hirschhorn|writing again/i.test(seen.answer) },
			{ name: 'changes nothing', pass: (seen) => !seen.calls.some((call) => /^table_(?!read|look)/.test(call.name)) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'selection-remove',
		ask: 'Delete the selected ones.',
		page: '/tables/evaltable1',
		pageTitle: 'Scratch',
		table: SELECTION_TABLE,
		selected: ['b1', 'b3'],
		checks: [
			{ name: 'removes exactly the selection', pass: (seen) => !seen.items.some((item) => ['b1', 'b3'].includes(item.id)) && ['b2', 'b4', 'n1'].every((id) => seen.items.some((item) => item.id === id)) },
			{ name: 'one call', pass: (seen) => seen.calls.length === 1 }
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
