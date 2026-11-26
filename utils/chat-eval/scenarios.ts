/** Questions Casey has asked the chat, with what a good run of each looks like. */
import type { FakeItem } from './fake-table';

interface Seen { answer: string; calls: { name: string; args: string; error?: boolean }[]; went: string[]; items: FakeItem[] }
export interface Scenario { name: string; ask: string; page?: string; pageTitle?: string; table?: FakeItem[]; selected?: string[]; /** Skills Casey has besides the built-in ones. */ skills?: { name: string; description: string; instructions: string }[]; checks: { name: string; pass(seen: Seen): unknown }[] }

const used = (seen: Seen, name: RegExp) => seen.calls.filter((call) => name.test(call.name)).length;

/** Five things side by side, for the scenarios where Casey has some of them selected. */
const SELECTION_TABLE: FakeItem[] = [
	{ id: 'b1', type: 'post', title: 'Writing again', url: 'https://caseyagollan.com/2026/11/17/writing-again/', text: 'I want to write here more often, in public, in small pieces.', x: 0, y: 0, w: 240, h: 240 },
	{ id: 'b2', type: 'book', title: 'The Dispossessed', url: 'https://caseyagollan.com/library/9780061054884/', text: 'Ursula K. Le Guin. An ambiguous utopia: an anarchist moon and the planet it left.', x: 300, y: 0, w: 180, h: 300 },
	{ id: 'b3', type: 'post', title: 'Hirschhorn', url: 'https://caseyagollan.com/2026/11/17/hirschhorn/', text: 'Thomas Hirschhorn on energy yes, quality no.', x: 600, y: 0, w: 240, h: 240 },
	{ id: 'b4', type: 'book', title: 'Deep Listening', url: 'https://caseyagollan.com/library/9780595343652/', text: 'Pauline Oliveros. A composer’s sound practice: listening as attention to everything.', x: 900, y: 0, w: 180, h: 300 },
	{ id: 'n1', type: 'note', text: 'Attention as a practice', x: 300, y: 400, w: 200, h: 200 }
];

/* Messy tables, for the layout scenarios: things dropped on top of each other, as after a long chat. */
const note = (id: string, text: string, x: number, y: number, h = 200): FakeItem => ({ id, type: 'note', text, x, y, w: 200, h });
const arrow = (id: string, from: string, to: string): FakeItem => ({ id, type: 'arrow', from, to, x: 0, y: 0, w: 1, h: 1 });
const HEAP: FakeItem[] = [
	...SELECTION_TABLE.map((item, index) => ({ ...item, x: 40 + index * 90, y: 30 + (index % 3) * 70 })),
	note('n2', 'Listening is not the same as hearing', 120, 260, 248),
	note('n3', 'Sonic meditations', 300, 180),
	note('n4', 'Write in public, in small pieces, often, and let the pieces add up to something over the years rather than waiting for the finished thing', 520, 90, 320),
	{ id: 'b5', type: 'arena', title: 'Calm Technology Research', url: 'https://www.are.na/casey-gollan/calm-technology-research', x: 200, y: 420, w: 240, h: 240 },
	{ id: 'b6', type: 'wiki', title: 'Share interests daily', url: 'https://caseyagollan.com/wiki/share-interests-daily', x: 330, y: 480, w: 240, h: 240 },
	note('n5', 'Energy yes, quality no', 610, 330),
	note('n6', 'Ambiguous utopia', 60, 520)
];
const ORG: FakeItem[] = [
	note('o1', 'Editor in chief', 300, 260), note('o2', 'Managing editor', 120, 80), note('o3', 'Art director', 340, 120), note('o4', 'Web editor', 500, 300),
	note('o5', 'Copy editor', 80, 300), note('o6', 'Fact checker', 260, 420), note('o7', 'Designer', 560, 60), note('o8', 'Photo editor', 480, 480),
	arrow('a1', 'o1', 'o2'), arrow('a2', 'o1', 'o3'), arrow('a3', 'o1', 'o4'), arrow('a4', 'o2', 'o5'), arrow('a5', 'o2', 'o6'), arrow('a6', 'o3', 'o7'), arrow('a7', 'o3', 'o8')
];
const MIND: FakeItem[] = [
	note('m0', 'Deep listening', 900, 40), note('m1', 'Attention', 0, 0), note('m2', 'Sonic meditations', 120, 90), note('m3', 'Environment', 260, 30),
	note('m4', 'Breath', 60, 240), note('m5', 'Improvisation', 300, 260), note('m6', 'Accordion', 420, 120), note('m7', 'Silence', 200, 380),
	arrow('a1', 'm0', 'm1'), arrow('a2', 'm0', 'm2'), arrow('a3', 'm0', 'm3'), arrow('a4', 'm0', 'm5'), arrow('a5', 'm2', 'm4'), arrow('a6', 'm5', 'm6'), arrow('a7', 'm1', 'm7')
];
const THEMES: FakeItem[] = [
	note('t1', 'Sourdough starter', 0, 0), note('t2', 'Tomato seedlings', 90, 60), note('t3', 'Bike chain needs oil', 180, 20), note('t4', 'Rye loaf, 75% hydration', 40, 180),
	note('t5', 'Compost bin', 260, 140), note('t6', 'New brake pads', 330, 40), note('t7', 'Focaccia for Sunday', 140, 260), note('t8', 'Plant garlic in October', 300, 300), note('t9', 'Route to the reservoir', 420, 200)
];
const FRAMED: FakeItem[] = [
	{ id: 'f1', type: 'frame', text: 'Listening', x: 0, y: 0, w: 700, h: 560 },
	...[note('k1', 'Attention', 40, 40), note('k2', 'Sonic meditations', 150, 100), note('k3', 'Breath', 260, 60, 280), note('k4', 'Silence', 120, 280), note('k5', 'Environment', 330, 300), note('k6', 'Improvisation', 440, 120)].map((item) => ({ ...item, parent: 'f1' })),
	note('x1', 'Unrelated: buy stamps', 800, 40), note('x2', 'Unrelated: call the landlord', 800, 300)
];
const at = (seen: Seen, id: string) => seen.items.find((item) => item.id === id)!;
const arranged = (seen: Seen, layout: RegExp) => seen.calls.some((call) => call.name === 'table_arrange' && !call.error && layout.test(call.args));
const noMoves = (seen: Seen) => !used(seen, /^table_move$/);

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
		// Casey's ask (2026-11-26): “if the source is a PDF there should be a tool to render those pages out onto canvas as images”.
		name: 'table-render-pdf',
		ask: 'Render this PDF’s pages onto the table.',
		page: '/tables/evaltable1',
		pageTitle: 'Transformers',
		table: [
			{ id: 'b1', type: 'link', title: 'Attention Is All You Need', url: 'https://arxiv.org/pdf/1706.03762', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'n1', type: 'note', text: 'Read before Friday', x: 0, y: 320, w: 200, h: 200 }
		],
		selected: ['b1'],
		checks: [
			{ name: 'uses table_render', pass: (seen) => used(seen, /^table_render$/) >= 1 },
			{ name: 'puts twelve pages on the table', pass: (seen) => seen.items.filter((item) => item.type === 'image' && /#page=\d+$/.test(item.url ?? '')).length === 12 },
			{ name: 'joins the pages to the PDF', pass: (seen) => seen.items.some((item) => item.type === 'arrow' && item.from === 'b1') },
			{ name: 'says there are more pages', pass: (seen) => /15|more|rest|remaining|13/i.test(seen.answer) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		// The same message: “and a tool for webpages to render a full webpage screenshot”.
		name: 'table-render-screenshot',
		ask: 'Put a full-page screenshot of https://indieweb.org/Micropub on the table.',
		page: '/tables/evaltable1',
		pageTitle: 'IndieWeb',
		table: [{ id: 'n1', type: 'note', text: 'Protocols to read up on', x: 0, y: 0, w: 200, h: 200 }],
		checks: [
			{ name: 'uses table_render', pass: (seen) => used(seen, /^table_render$/) >= 1 },
			{ name: 'adds one tall picture of the page', pass: (seen) => { const shots = seen.items.filter((item) => item.type === 'image' && /indieweb\.org\/Micropub/.test(item.url ?? '')); return shots.length === 1 && shots[0].h > shots[0].w * 2; } },
			{ name: 'doesn’t read the page instead', pass: (seen) => !used(seen, /^fetch_page$/) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'table-render-selected-page',
		ask: 'Screenshot the whole page for this one.',
		page: '/tables/evaltable1',
		pageTitle: 'IndieWeb',
		table: [
			{ id: 'b1', type: 'link', title: 'Webmention - IndieWeb', url: 'https://indieweb.org/Webmention', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'b2', type: 'link', title: 'Micropub - IndieWeb', url: 'https://indieweb.org/Micropub', x: 0, y: 320, w: 240, h: 240 }
		],
		selected: ['b1'],
		checks: [
			{ name: 'uses table_render', pass: (seen) => used(seen, /^table_render$/) >= 1 },
			{ name: 'screenshots only the selected block', pass: (seen) => { const shots = seen.items.filter((item) => item.type === 'image'); return shots.length === 1 && /Webmention/.test(shots[0].url ?? ''); } },
			{ name: 'joins it to its block', pass: (seen) => seen.items.some((item) => item.type === 'arrow' && item.from === 'b1') },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
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
			{ name: 'a line from a block to each of its pieces', pass: (seen) => pieces(seen.items).every((piece) => seen.items.some((item) => item.type === 'arrow' && ['b1', 'b2'].includes(item.from ?? '') && item.to === piece.id)) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		// Casey's table "Calm Technology — force map" (chat ahgpdsg054): a channel gave are.na's placeholder words, its blocks nothing.
		name: 'table-pull-arena',
		ask: 'pull context',
		page: '/tables/evaltable1',
		pageTitle: 'Calm Technology',
		table: [
			{ id: 'c1', type: 'arena', title: 'Index of Calm Technologies', url: 'https://www.are.na/casey-gollan/index-of-calm-technologies', x: 0, y: 0, w: 240, h: 240 },
			{ id: 'a1', type: 'arena', title: 'Glow - macwright.org', url: 'https://www.are.na/block/2617940', x: 0, y: 400, w: 240, h: 240 },
			{ id: 'a2', type: 'arena', title: 'Tea Kettle', url: 'https://www.are.na/block/1204699', x: 300, y: 0, w: 240, h: 240 }
		],
		selected: ['c1', 'a1'],
		checks: [
			{ name: 'pulls from the channel and the block', pass: (seen) => ['c1', 'a1'].every((id) => seen.items.some((item) => item.type === 'arrow' && item.from === id)) },
			{ name: 'no placeholder words', pass: (seen) => !seen.items.some((item) => /lorem ipsum|example channel/i.test(item.text ?? '')) },
			{ name: 'a line to each piece', pass: (seen) => pieces(seen.items).every((piece) => seen.items.some((item) => item.type === 'arrow' && item.to === piece.id)) },
			{ name: 'no frames', pass: (seen) => !seen.items.some((item) => item.type === 'frame') },
			{ name: 'what was there stays put', pass: (seen) => seen.items.find((item) => item.id === 'a2')?.x === 300 && seen.items.find((item) => item.id === 'a2')?.y === 0 },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
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
		name: 'selection-tag',
		ask: 'Tag these as writing and take practice off them.',
		page: '/tables/evaltable1',
		pageTitle: 'Scratch',
		table: SELECTION_TABLE,
		selected: ['b1', 'b3'],
		checks: [
			{ name: 'one table_tag for the selection', pass: (seen) => seen.calls.length === 1 && seen.calls[0].name === 'table_tag' && !seen.calls[0].error && /writing/.test(seen.calls[0].args) && /practice/.test(seen.calls[0].args) },
			{ name: 'never the Micropub tools', pass: (seen) => !used(seen, /^micropub_/) },
			{ name: 'says staged, not saved', pass: (seen) => /staged|review/i.test(seen.answer) && !/\b(saved|updated|committed)\b(?! yet)/i.test(seen.answer.replace(/not (yet )?saved|until (you|casey) save[sd]?|review and save|to save/gi, '')) }
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
		// A pasted are.na address: the page itself is drawn in the browser, so it has to come through the API.
		name: 'arena-address',
		ask: 'What’s in https://www.are.na/casey-gollan/calm-technology-research ? Just the highlights.',
		page: '/',
		checks: [
			{ name: 'reads it without an error', pass: (seen) => seen.calls.some((call) => (call.name === 'fetch_page' || call.name === 'my_saves') && /calm/i.test(call.args) && !call.error) },
			{ name: 'names things that are in it', pass: (seen) => /weiser|daylight|calm tech certified|amber case|principles and patterns/i.test(seen.answer) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		// Casey, 2026-11-26: “give the chat much better tools for fixing layout of a selection or a whole table”.
		name: 'layout-mess',
		ask: 'This table is a mess. Fix the layout.',
		page: '/tables/evaltable1',
		pageTitle: 'Listening',
		table: HEAP,
		checks: [
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'one arrange does it, with no moving by hand', pass: (seen) => used(seen, /^table_arrange$/) >= 1 && noMoves(seen) },
			{ name: 'everything is still there', pass: (seen) => seen.items.length >= HEAP.length },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'layout-org-chart',
		ask: 'Lay this out as an org chart.',
		page: '/tables/evaltable1',
		pageTitle: 'Masthead',
		table: ORG,
		checks: [
			{ name: 'arranges as a tree', pass: (seen) => arranged(seen, /"(tree|layered|org|hierarchy)/) },
			{ name: 'everyone sits under who they report to', pass: (seen) => seen.items.filter((item) => item.type === 'arrow').every((link) => at(seen, link.from!).y + at(seen, link.from!).h <= at(seen, link.to!).y) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'no moving by hand', pass: noMoves },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'layout-mindmap',
		ask: 'Turn this into a mind map around “Deep listening”.',
		page: '/tables/evaltable1',
		pageTitle: 'Listening',
		table: MIND,
		checks: [
			{ name: 'arranges as a mind map or rings', pass: (seen) => arranged(seen, /"(mindmap|radial)/) },
			{ name: 'branches on both sides of the middle', pass: (seen) => { const middle = at(seen, 'm0'); const others = seen.items.filter((item) => item.type === 'note' && item.id !== 'm0'); return others.some((item) => item.x + item.w <= middle.x) && others.some((item) => item.x >= middle.x + middle.w); } },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'layout-themes',
		ask: 'Group these by theme.',
		page: '/tables/evaltable1',
		pageTitle: 'To do',
		table: THEMES,
		checks: [
			{ name: 'clusters with named groups', pass: (seen) => arranged(seen, /groups/) },
			{ name: 'makes a named frame per theme, at least three', pass: (seen) => seen.items.filter((item) => item.type === 'frame' && item.text).length >= 3 },
			{ name: 'bread goes together, and not with the bike', pass: (seen) => at(seen, 't1').parent && at(seen, 't1').parent === at(seen, 't4').parent && at(seen, 't1').parent === at(seen, 't7').parent && at(seen, 't3').parent !== at(seen, 't1').parent && at(seen, 't3').parent === at(seen, 't6').parent },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'layout-frame',
		ask: 'Tidy up what’s inside the Listening frame.',
		page: '/tables/evaltable1',
		pageTitle: 'Listening',
		table: FRAMED,
		checks: [
			{ name: 'arranges inside the frame', pass: (seen) => seen.calls.some((call) => call.name === 'table_arrange' && !call.error && /f1|listening/i.test(call.args)) },
			{ name: 'what it holds is still inside it', pass: (seen) => { const frame = at(seen, 'f1'); return seen.items.filter((item) => item.parent === 'f1').every((item) => item.x >= frame.x && item.y >= frame.y && item.x + item.w <= frame.x + frame.w && item.y + item.h <= frame.y + frame.h); } },
			{ name: 'the notes outside it stay outside and apart from it', pass: (seen) => ['x1', 'x2'].every((id) => !at(seen, id).parent && (at(seen, id).x >= at(seen, 'f1').x + at(seen, 'f1').w || at(seen, id).y >= at(seen, 'f1').y + at(seen, 'f1').h)) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'layout-selection',
		ask: 'Make these a tidy row.',
		page: '/tables/evaltable1',
		pageTitle: 'Listening',
		table: HEAP,
		selected: ['n2', 'n3', 'n5', 'n6'],
		checks: [
			{ name: 'arranges only the selection', pass: (seen) => seen.calls.some((call) => call.name === 'table_arrange' && !call.error && /selected|n2/.test(call.args)) },
			{ name: 'the four share a top edge and don’t overlap each other', pass: (seen) => { const four = ['n2', 'n3', 'n5', 'n6'].map((id) => at(seen, id)); return new Set(four.map((item) => item.y)).size === 1 && !overlaps(four); } },
			{ name: 'doesn’t read the table to find them', pass: (seen) => !used(seen, /^table_read$/) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'layout-flow',
		ask: 'Show the notes on this table as a process, left to right: research, then draft, then edit, then publish.',
		page: '/tables/evaltable1',
		pageTitle: 'Writing',
		table: [note('p1', 'Publish', 0, 0), note('p2', 'Draft', 80, 60), note('p3', 'Research', 160, 20), note('p4', 'Edit', 60, 160)],
		checks: [
			{ name: 'uses the four notes that are there', pass: (seen) => seen.items.filter((item) => item.type === 'note' || item.type === 'text').length === 4 },
			{ name: 'joins the steps with three arrows', pass: (seen) => seen.items.filter((item) => item.type === 'arrow').length === 3 },
			{ name: 'reads left to right in order', pass: (seen) => ['p3', 'p2', 'p4', 'p1'].every((id, index, ids) => !index || at(seen, ids[index - 1]).x + 200 <= at(seen, id).x) },
			{ name: 'nothing overlaps', pass: (seen) => !overlaps(seen.items) },
			{ name: 'four calls or fewer', pass: (seen) => seen.calls.length <= 4 }
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
	},
	// Skills: the assistant picks one by its description, a slash command brings one along, and adding one only ever makes a review card.
	{
		name: 'skill-auto',
		ask: 'Do a link roundup for this week.',
		skills: [{ name: 'link-roundup', description: 'Write a link roundup from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.', instructions: '# Link roundup\n\n1. One search_site call with `days: 7` and no query finds the week’s posts.\n2. Pick the bookmarks and likes, and group them under two or three themes.\n3. Answer with the roundup itself in Markdown: a `##` heading per theme and a line per link saying why it was worth saving. End with the exact line `Roundup by the link-roundup skill.`\n4. Don’t save anything unless Casey asks.' }],
		checks: [
			{ name: 'reads the skill first', pass: (seen) => seen.calls[0]?.name === 'use_skill' && /link-roundup/.test(seen.calls[0].args) },
			{ name: 'follows it', pass: (seen) => /Roundup by the link-roundup skill/i.test(seen.answer) && used(seen, /^search_site$/) >= 1 },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'skill-slash',
		ask: '/link-roundup for this week',
		skills: [{ name: 'link-roundup', description: 'Write a link roundup from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.', instructions: '# Link roundup\n\n1. One search_site call with `days: 7` and no query finds the week’s posts.\n2. Pick the bookmarks and likes, and group them under two or three themes.\n3. Answer with the roundup itself in Markdown: a `##` heading per theme and a line per link saying why it was worth saving. End with the exact line `Roundup by the link-roundup skill.`\n4. Don’t save anything unless Casey asks.' }],
		checks: [
			{ name: 'doesn’t load the skill again', pass: (seen) => !used(seen, /^use_skill$/) },
			{ name: 'follows it', pass: (seen) => /Roundup by the link-roundup skill/i.test(seen.answer) && used(seen, /^search_site$/) >= 1 },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'skill-not-needed',
		ask: 'What did I post about Micropub?',
		skills: [{ name: 'link-roundup', description: 'Write a link roundup from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.', instructions: '# Link roundup\n\n1. One search_site call with `days: 7` and no query finds the week’s posts.\n2. Pick the bookmarks and likes, and group them under two or three themes.\n3. Answer with the roundup itself in Markdown: a `##` heading per theme and a line per link saying why it was worth saving. End with the exact line `Roundup by the link-roundup skill.`\n4. Don’t save anything unless Casey asks.' }],
		checks: [
			{ name: 'no skill for an ordinary question', pass: (seen) => !used(seen, /^(use_skill|skill_)/) },
			{ name: 'searches', pass: (seen) => used(seen, /^search_site$/) >= 1 }
		]
	},
	{
		name: 'skill-create',
		ask: '/skill-creator Make a skill for a weekly review: list what I posted in the last 7 days by type, point out anything still in drafts, and suggest one thing to write next. Just draft it, no questions.',
		checks: [
			{ name: 'puts a draft up for review', pass: (seen) => seen.calls.some((call) => call.name === 'skill_add' && !call.error && !/"source"/.test(call.args)) },
			{ name: 'doesn’t claim it is installed', pass: (seen) => !/\b(is|has been|i(’|')ve|now) (installed|added|saved)\b/i.test(seen.answer) || /press|card|review/i.test(seen.answer) },
			{ name: 'says how to use it', pass: (seen) => /\/[a-z0-9-]+/.test(seen.answer) },
			{ name: 'two calls or fewer', pass: (seen) => seen.calls.length <= 2 }
		]
	},
	{
		name: 'skill-find',
		ask: 'Is there a skill for writing changelogs?',
		checks: [
			{ name: 'searches skills.sh', pass: (seen) => seen.calls.some((call) => call.name === 'skill_find' && !call.error) },
			{ name: 'names what it found with a skills.sh link', pass: (seen) => /skills\.sh\//.test(seen.answer) },
			{ name: 'adds nothing unasked', pass: (seen) => !used(seen, /^skill_add$/) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	},
	{
		name: 'skill-install',
		ask: 'Install the frontend-design skill from anthropics/skills.',
		checks: [
			{ name: 'offers it from its source', pass: (seen) => seen.calls.some((call) => call.name === 'skill_add' && !call.error && /anthropics\/skills/.test(call.args) && /frontend-design/.test(call.args)) },
			{ name: 'says Casey adds it from the card, not that it is installed', pass: (seen) => /card|press|review|add it/i.test(seen.answer) },
			{ name: 'three calls or fewer', pass: (seen) => seen.calls.length <= 3 }
		]
	}
];

const pieces = (items: FakeItem[]) => items.filter((item) => item.type === 'quote' || item.type === 'image');

function overlaps(items: FakeItem[]): boolean {
	const solid = items.filter((item) => item.type !== 'arrow' && item.type !== 'frame' && item.type !== 'draw');
	return solid.some((a, index) => solid.slice(index + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
}
