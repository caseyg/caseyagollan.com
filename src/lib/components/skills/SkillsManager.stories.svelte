<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { memorySkills } from '$lib/chat-skills-client';
	import SkillsManager from './SkillsManager.svelte';
	import { client, registry, skills } from './fixtures';

	const { Story } = defineMeta({ title: 'Site/SkillsManager', component: SkillsManager, tags: ['!autodocs'] });
</script>

<!-- The Skills group on /account: each skill with its slash command, where it came from, and its switch. -->
<Story name="Skills" args={{ client: client(), skills }} />

<!-- Before any skill is added: the two that come with the site. -->
<Story name="Only the built-in ones" args={{ client: memorySkills(skills.slice(0, 2), registry), skills: skills.slice(0, 2) }} />

<!-- Add skill opens the four ways in: with the chat, by hand, from a file, from skills.sh or GitHub. -->
<Story name="Adding" args={{ client: client(), skills, view: 'add' }} />

<!-- Writing one by hand. -->
<Story name="Start from scratch" args={{ client: client(), skills, view: 'new' }} />

<!-- Searching skills.sh; Review fetches a skill and shows all of it before it can be added. -->
<Story name="From skills.sh or GitHub" args={{ client: client(), skills, view: 'install' }} />

<Story name="Phone" args={{ client: client(), skills }} parameters={{ viewport: { defaultViewport: 'mobile1' } }} />
