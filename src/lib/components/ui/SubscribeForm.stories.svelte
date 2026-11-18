<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SubscribeForm, { type SubscribeOutcome } from './SubscribeForm.svelte';

	const after = (outcome: SubscribeOutcome) => () => new Promise<SubscribeOutcome>((resolve) => setTimeout(() => resolve(outcome), 600));

	const { Story } = defineMeta({
		title: 'Primitives/SubscribeForm',
		component: SubscribeForm,
		parameters: { docs: { story: { height: '160px' } } },
		args: { submit: after({ ok: true, status: 'subscribed' }) }
	});
</script>

<!-- One field and one button. It posts `{ email }` to `/api/subscribe`, where the Worker adds the reader on Buttondown with the `BUTTONDOWN_API_KEY` secret. Here the request is stood in for. -->
<Story name="Default" />

<Story name="With hint" args={{ hint: 'New posts, now and then. Unsubscribe anytime.' }} />

<!-- For a place that already says what it is, such as the Subscribe menu. -->
<Story name="Hidden label" args={{ hideLabel: true, buttonLabel: 'Sign up' }} />

<Story name="Subscribed" args={{ initial: 'subscribed' }} />

<!-- Back from Buttondown's confirmation link, as `/posts?subscribe=confirmed`. -->
<Story name="Confirmed" args={{ initial: 'confirmed' }} />

<Story name="Already subscribed" args={{ submit: after({ ok: true, status: 'already' }) }} />

<Story name="Server error" args={{ submit: after({ ok: false, status: 'failed', message: 'That didn’t go through. Try again in a moment.' }) }} />

<!-- A branch preview has no Buttondown key, so the endpoint says so. -->
<Story name="Not set up" args={{ initial: 'unavailable' }} />

<Story asChild name="Narrow">
	<div style="width: 18rem"><SubscribeForm submit={after({ ok: true, status: 'subscribed' })} /></div>
</Story>
