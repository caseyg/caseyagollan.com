<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SkillForm from './SkillForm.svelte';
	import { roundup, skills } from './fixtures';

	const noop = () => undefined;
	const { Story } = defineMeta({ title: 'Site/SkillForm', component: SkillForm, tags: ['!autodocs'], args: { onsave: noop, oncancel: noop, ondelete: noop } });
</script>

<!-- A new skill: its name is also its slash command. -->
<Story name="New" />

<!-- One of Casey's own, open for editing, exporting or deleting. -->
<Story name="Editing" args={{ skill: roundup, saved: true }} />

<!-- A skill that ships with the site can be read and exported, not changed. -->
<Story name="Built in" args={{ skill: skills[0], saved: true }} />

<!-- One installed from elsewhere says where it came from, and keeps its reference files. -->
<Story name="Installed" args={{ skill: skills[3], saved: true }} />

<Story name="Too long" args={{ skill: { ...roundup, instructions: 'Do the thing. '.repeat(2000) }, saved: true }} />

<Story name="Save failed" args={{ skill: roundup, saved: true, error: 'You already have a skill called “link-roundup”.' }} />
