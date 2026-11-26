<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatPromptInput from './ChatPromptInput.svelte';
	import { owner, visitor } from './fixtures';

	const send = (text: string, { queue }: { queue: boolean }) => { console.log(queue ? 'Would queue' : 'Would send', text); return true; };
	const skills = [
		{ name: 'skill-creator', description: 'Write a new skill for this chat, or improve one Casey already has.', enabled: true, origin: 'builtin' as const, updatedAt: 0 },
		{ name: 'find-skills', description: 'Find published skills on skills.sh and offer to install one.', enabled: true, origin: 'builtin' as const, updatedAt: 0 },
		{ name: 'link-roundup', description: 'Write a link roundup post from recent bookmarks and likes. Use whenever Casey asks for a roundup, a links post, or “what I’ve been reading”.', enabled: true, origin: 'custom' as const, updatedAt: 0 }
	];
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

<Story name="Slash command, narrowed" args={{ viewer: owner, compact: true, value: '/li', skills }} />
