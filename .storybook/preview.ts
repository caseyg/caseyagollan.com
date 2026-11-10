import type { Preview } from '@storybook/sveltekit';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { http, HttpResponse } from 'msw';
import '../src/app.css';
import './preview.css';

initialize({
	onUnhandledRequest: 'bypass',
	serviceWorker: { url: './mockServiceWorker.js' }
});

const preview: Preview = {
	tags: ['autodocs'],
	loaders: [mswLoader],
	parameters: {
		layout: 'padded',
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
		msw: {
			handlers: [
				http.get('https://webmention.io/api/count.json', () => HttpResponse.json({ type: { like: 3, repost: 1, reply: 2 } })),
				http.get('https://webmention.io/api/mentions.jf2', () => HttpResponse.json({ children: [
					{ 'wm-id': 1, 'wm-property': 'like-of', url: 'https://example.com/like', author: { name: 'Example reader', url: 'https://example.com', photo: '/author-avatar.webp' } },
					{ 'wm-id': 2, 'wm-property': 'in-reply-to', url: 'https://example.com/reply', published: '2026-01-10T12:00:00Z', author: { name: 'Example reader', url: 'https://example.com', photo: '/author-avatar.webp' }, content: { text: 'Thanks for sharing this idea!' } }
				] }))
			]
		},
		options: { storySort: { order: ['Site', 'Posts'] } }
	}
};
export default preview;
