import type { ChatAuthor, ChatMessage, ChatThreadSummary, ChatViewer } from '$lib/chat';

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
