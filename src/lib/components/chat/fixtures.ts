import type { ChatAuthor, ChatMessage, ChatSelectionItem, ChatThreadSummary, ChatViewer } from '$lib/chat';

/** Sample people and messages for the Chat stories. */
const at = Date.UTC(2026, 10, 18, 15, 0);
export const ana: ChatAuthor = { id: 'mastodon:ana@social.coop', name: 'Ana', url: 'https://social.coop/@ana', via: 'mastodon' };
export const jo: ChatAuthor = { id: 'web:https://jo.example/', name: 'jo.example', url: 'https://jo.example/', via: 'indieauth' };
export const casey: ChatAuthor = { id: 'web:https://caseyagollan.com/', name: 'Casey Gollan', url: 'https://caseyagollan.com/', photo: '/author-avatar.webp', via: 'owner' };
export const visitor: ChatViewer = { ...ana, owner: false };
export const owner: ChatViewer = { ...casey, owner: true };

export const question: ChatMessage = { id: 'm1', role: 'user', author: ana, content: 'What has Casey written about **Micropub**?', status: 'done', createdAt: at };
export const answer: ChatMessage = {
	id: 'm2', role: 'assistant', model: 'glm-flash-green', status: 'done', createdAt: at + 20_000,
	tools: [
		{ tool: 'search_site', label: 'Searched the site for “micropub”', status: 'done', links: [{ url: 'https://caseyagollan.com/2026/11/14/micropub-threads/', title: 'Syndication threads over Micropub' }, { url: 'https://caseyagollan.com/wiki/indieweb', title: 'IndieWeb' }] },
		{ tool: 'fetch_page', label: 'Read caseyagollan.com/2026/11/14/micropub-threads/', status: 'done', links: [{ url: 'https://caseyagollan.com/2026/11/14/micropub-threads/', title: 'Syndication threads over Micropub' }] }
	],
	content: 'Casey wrote up [syndication threads over Micropub](https://caseyagollan.com/2026/11/14/micropub-threads/): a post can carry its social copy as a reply chain, and the endpoint advertises it in `q=config`.\n\n- One value per post in `syndication-thread`\n- Photos per post in `syndication-photo-post`'
};
export const followUp: ChatMessage = { id: 'm3', role: 'user', author: jo, content: 'Is there a spec diff somewhere?', status: 'done', createdAt: at + 60_000 };
export const streaming: ChatMessage = {
	id: 'm4', role: 'assistant', model: 'glm-flash-green', status: 'streaming', createdAt: at + 65_000,
	tools: [{ tool: 'search_site', label: 'Searched the site for “syndication thread spec”', status: 'running' }],
	content: 'There is: the proposal sits next to the code, with a **diff against'
};
export const failed: ChatMessage = { id: 'm5', role: 'assistant', model: 'glm-flash-green', status: 'failed', createdAt: at + 90_000, content: '*The answer stopped: inference.coop answered 503.*' };
export const draft: ChatMessage = {
	id: 'm6', role: 'assistant', model: 'glm-flash-green', status: 'done', createdAt: at + 120_000,
	tools: [{ tool: 'micropub_create_post', label: 'Saved a draft', status: 'done' }],
	content: 'Saved it as a draft note. It’s in your drafts; nothing is published.'
};
export const conversation: ChatMessage[] = [question, answer, followUp, streaming];

export const threads: ChatThreadSummary[] = [
	{ id: 'a1b2c3d4e5', title: 'What has Casey written about Micropub?', createdAt: at, updatedAt: at + 65_000, messageCount: 4, startedBy: ana, participants: [jo, ana] },
	{ id: 'f6g7h8i9j0', title: 'Books in the library about cooperatives', createdAt: at - 86400_000 * 3, updatedAt: at - 86400_000 * 2, messageCount: 12, startedBy: jo, participants: [casey, jo] },
	{ id: 'k1l2m3n4o5', title: 'A very long question that someone asked about the library graph, how it loads, and why the selected book holds still while the rest settle', createdAt: at - 86400_000 * 40, updatedAt: at - 86400_000 * 40, messageCount: 2, startedBy: ana, participants: [ana] }
];

/** A table's chat: Casey asks, the assistant changes the table and shows a page. */
export const tableAsk: ChatMessage = { id: 't1', role: 'user', author: casey, content: 'Add my posts about cooperatives and set them out in a grid', status: 'done', createdAt: at + 200_000 };
export const tableAnswer: ChatMessage = {
	id: 't2', role: 'assistant', model: 'glm-flash-green', status: 'done', createdAt: at + 215_000,
	tools: [
		{ tool: 'table_read', label: 'Read the table', status: 'done' },
		{ tool: 'table_add', label: 'Added 3 notes and results for “cooperatives”', status: 'done' },
		{ tool: 'table_pull', label: 'Context pull: pictures and quotes from 2 blocks', status: 'done' },
		{ tool: 'table_arrange', label: 'Arranged the table in a grid', status: 'done' },
		{ tool: 'table_look', label: 'Looked at the table', status: 'done', picture: { src: 'table-look.jpg', alt: 'What the assistant saw of the table, each item numbered' } },
		{ tool: 'show_page', label: 'Showed Platform cooperativism', status: 'done', peek: { url: 'https://caseyagollan.com/wiki/platform-cooperativism', title: 'Platform cooperativism', excerpt: 'Notes on worker- and user-owned platforms, and the reading list that goes with them.' } }
	],
	content: 'Added six posts and set everything out in a three-column grid. The wiki page above has the reading list they come from.'
};
export const tableConversation: ChatMessage[] = [tableAsk, tableAnswer];

/** What Casey has selected on the table: sent with the message, shown above the composer and on the message. */
export const selection: ChatSelectionItem[] = [
	{ id: 'b1', type: 'post', title: 'Writing again' },
	{ id: 'b2', type: 'book', title: 'The Dispossessed' },
	{ id: 'n1', type: 'note', title: 'Why the site' }
];
export const selectionAsk: ChatMessage = { id: 't3', role: 'user', author: casey, content: 'Frame these as Reading', status: 'done', createdAt: at + 260_000, selection: { count: 3, items: selection } };
export const selectionAnswer: ChatMessage = {
	id: 't4', role: 'assistant', model: 'glm-flash-green', status: 'done', createdAt: at + 265_000,
	content: 'Done: the three are in a frame named **Reading**.',
	tools: [{ tool: 'table_group', label: 'Framed the selected items as “Reading”', status: 'done' }]
};
export const selectionConversation: ChatMessage[] = [selectionAsk, selectionAnswer];
