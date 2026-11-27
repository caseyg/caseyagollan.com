<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { memorySkills } from '$lib/chat-skills-client';
	import SkillSetReview from './SkillSetReview.svelte';
	import { kitNotes, kitProposals, skills } from './fixtures';

	const refs = kitProposals.map((one) => ({ id: one.id, name: one.skill.name, description: one.skill.description, origin: one.skill.origin, source: one.skill.source, replaces: !!one.replaces }));
	const { Story } = defineMeta({ title: 'Chat/SkillSetReview', component: SkillSetReview, tags: ['!autodocs'], args: { client: memorySkills(skills, [], kitProposals), skills: refs, proposals: kitProposals, from: 'acme/writing-kit' } });
</script>

<!-- Every skill of a repository, fetched at once: each is read, ticked and added by itself. -->
<Story name="From a repository" />

<!-- A plugin marketplace: only its plugins' skills come along, and the card says what didn't. -->
<Story name="From a plugin marketplace" args={{ notes: kitNotes }} />

<!-- The repository holds more than are shown at once. -->
<Story name="More than shown" args={{ total: 31 }} />

<!-- Opened again later, or by someone who isn't Casey: nothing is waiting any more. -->
<Story name="No longer waiting" args={{ proposals: [], client: memorySkills(skills) }} />

<Story name="Phone" args={{ notes: kitNotes }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
