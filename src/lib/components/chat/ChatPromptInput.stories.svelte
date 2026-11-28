<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import { CHAT_PROVIDERS, modelOptions } from '$lib/chat-models';
	import { owner, visitor } from './fixtures';
	import { VoiceError } from '$lib/voice-source';
	import { ASKED, scriptedRefine, scriptedSource } from '$lib/storybook/voice';

	const models = { models: modelOptions(CHAT_PROVIDERS), current: 'inference-coop:glm-flash-green' };

	const send = (text: string, { queue }: { queue: boolean }) => { console.log(queue ? 'Would queue' : 'Would send', text); return true; };
	const skills = [
		{ name: 'skill-creator', description: 'Write a new skill for this chat, or improve one Casey already has.', enabled: true, origin: 'builtin' as const, updatedAt: 0 },
		{ name: 'find-skills', description: 'Find published skills on skills.sh and offer to install one.', enabled: true, origin: 'builtin' as const, updatedAt: 0 },
		{ name: 'link-roundup', description: 'Write a link roundup post from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.', enabled: true, origin: 'custom' as const, updatedAt: 0 }
	];
	/** A microphone that "hears" a script, and a stand-in for the model that corrects; choices aren't kept. */
	const voice = { sources: () => [scriptedSource(ASKED)], refine: scriptedRefine, storage: { getItem: () => null, setItem: () => {} } };
	const typing = { ...voice, storage: { getItem: () => JSON.stringify({ send: false }), setItem: () => {} } };
	const blocked = { ...voice, sources: () => [{ name: 'blocked', start: () => Promise.reject(new VoiceError('The microphone is blocked for this site. Allow it in the browser’s site settings.')) }] };
	const { Story } = defineMeta({ title: 'Chat/ChatPromptInput', component: ChatPromptInput, args: { viewer: visitor, onsend: send, tools: ['search_site', 'fetch_page'] } });
</script>

<!-- One quiet line until focused (progressive disclosure, like the post composer). -->
<Story name="Closed" />

<Story name="Open" args={{ open: true, value: 'Which books about cooperatives are in the library?' }} />

<!-- Casey's own session: Micropub is listed, and there's no chat sign-out. -->
<Story name="Owner" args={{ viewer: owner, open: true, tools: ['search_site', 'fetch_page', 'micropub'] }} />

<Story name="Too long" args={{ open: true, value: 'x'.repeat(4100) }} />

<Story name="Phone" args={{ open: true }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />

<!-- The chat's own composer: a box and a round Send. Enter sends, and joins an answer that's being written. -->
<Story name="Compact" args={{ compact: true, value: 'Only the ones from this year' }} />

<!-- With Cmd held (Ctrl off a Mac), Send shows a plus: the message waits for the answer being written to end. -->
<Story name="Compact, Cmd held" args={{ compact: true, queueing: true, value: 'Then put them on a table' }} />

<!-- A slash starts a skill: the ones that match are listed above the box; Enter or a press fills the name in. -->
<Story name="Slash command" args={{ viewer: owner, compact: true, value: '/', skills }} />

<!-- A skill can be called for anywhere in a message, not only at its start. -->
<Story name="Slash command, mid-message" args={{ viewer: owner, compact: true, value: 'For this week, do a /li', skills }} />

<Story name="Slash command, narrowed" args={{ viewer: owner, compact: true, value: '/li', skills }} />

<!-- Casey's composer with the Model menu beside Send: the model answering this chat, and the others that could. -->
<Story name="Model menu" args={{ viewer: owner, compact: true, value: 'What did I post about cooperatives?', models, onmodel: () => {} }} />

<Story name="Model menu, phone" args={{ viewer: owner, compact: true, models: { ...models, current: 'anthropic:claude-sonnet-5-5' }, onmodel: () => {} }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />

<!--
	Casey's microphone. Press it: the words arrive in the box as they are said, a pause corrects and
	sends them, and listening carries on for the next message. (Here a script speaks, twice.)
-->
<Story name="Voice" args={{ viewer: owner, compact: true, voice }} />

<!-- With “Send when I pause” off, what is said is added to the box, after what was typed, and waits there. -->
<Story name="Voice, sent by hand" args={{ viewer: owner, compact: true, value: 'A question for the library:', voice: typing }} />

<!-- A reason the microphone can’t listen opens its menu to say so. -->
<Story name="Voice, microphone blocked" args={{ viewer: owner, compact: true, voice: blocked }} />

<Story name="Voice, phone" args={{ viewer: owner, compact: true, models, onmodel: () => {}, voice }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
