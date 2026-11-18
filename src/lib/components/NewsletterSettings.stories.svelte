<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import NewsletterSettings, { type NewsletterState } from './NewsletterSettings.svelte';

	const keys = ['archive_theme', 'web_css', 'css', 'tint_color', 'subscription_redirect_url', 'subscription_confirmation_redirect_url'];
	const newsletter = (on: boolean) => ({ username: 'caseyagollan', name: 'Casey Gollan', url: 'https://buttondown.com/caseyagollan', applied: Object.fromEntries(keys.map((key) => [key, on])) });
	const later = (state: NewsletterState) => () => new Promise<NewsletterState>((resolve) => setTimeout(() => resolve(state), 500));

	const { Story } = defineMeta({ title: 'Site/NewsletterSettings', component: NewsletterSettings, parameters: { docs: { story: { height: '360px' } } } });
</script>

<!-- On /account, for the signed-in owner: which of the site's settings Buttondown has, and a button that sends them from the Worker. -->
<Story name="Not yet styled" args={{ load: later({ configured: true, newsletter: newsletter(false) }), apply: later({ configured: true, newsletter: newsletter(true) }) }} />

<Story name="Matches the site" args={{ load: later({ configured: true, newsletter: newsletter(true) }), apply: later({ configured: true, newsletter: newsletter(true) }) }} />

<Story name="No key" args={{ load: later({ configured: false }) }} />

<Story name="Buttondown unreachable" args={{ load: later({ configured: true, error: 'Buttondown couldn’t be reached, or the key was refused.' }) }} />
