<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { memorySkills } from '$lib/chat-skills-client';
	import SkillReview from './SkillReview.svelte';
	import { drafted, proposal, skills } from './fixtures';

	const ref = (from: typeof proposal, replaces = false) => ({ id: from.id, name: from.skill.name, description: from.skill.description, origin: from.skill.origin, source: from.skill.source, replaces });
	const { Story } = defineMeta({ title: 'Chat/SkillReview', component: SkillReview, tags: ['!autodocs'], args: { client: memorySkills(skills) } });
</script>

<!-- A published skill the chat fetched: where it is from, what was left behind, and every word to read before adding. -->
<Story name="From elsewhere" args={{ skill: ref(proposal), proposal }} />

<Story name="Instructions open" args={{ skill: ref(proposal), proposal, open: true }} />

<!-- One the chat drafted with the skill-creator skill. -->
<Story name="Drafted in the chat" args={{ skill: ref(drafted), proposal: drafted }} />

<!-- A new version of a skill Casey already has. -->
<Story name="Replaces one" args={{ skill: ref(drafted, true), proposal: { ...drafted, replaces: 'link-roundup' } }} />

<!-- Opened again later: it was added (a skill of its name exists), so the card only says so. -->
<Story name="Already added" args={{ skill: ref(drafted) }} />

<!-- Dismissed, gone stale, or seen by someone who isn't Casey. -->
<Story name="No longer waiting" args={{ skill: { ...ref(proposal), name: 'doc-coauthoring' } }} />

<Story name="Phone" args={{ skill: ref(proposal), proposal }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
