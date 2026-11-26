<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import SocialCard from './SocialCard.svelte';
 import SocialPost from './SocialPost.svelte';
 import { siteAuthor } from '$lib/social-card';
 const { Story } = defineMeta({ title: 'Posts/SocialCard', component: SocialCard });
 const casey = { ...siteAuthor, handle: '@caseyagollan.com' };
 const reader = { name: 'Example Reader', handle: '@example.com', url: 'https://bsky.app/profile/example.com' };
 const bluesky = [{ url: 'https://bsky.app/profile/caseyagollan.com/post/1', label: '🦋', title: 'View on Bluesky' }];
</script>

<!-- One shell for every social post: a single post, a reply under its parent, or a whole thread. -->
<Story name="Single post">
 <SocialPost author={casey} date="2026-01-10T12:00:00-05:00" url="/2026/01/10/storybook-note/" sources={bluesky}><p>A thought shared from the site.</p></SocialPost>
</Story>
<Story name="Reply">
 <SocialPost author={reader} date="2026-01-09T15:30:00-05:00" connected sources={bluesky}><p>Research is a way of paying attention together.</p></SocialPost>
 <SocialPost author={casey} date="2026-01-10T12:00:00-05:00" sources={bluesky}><p>This resonates with how I think about research.</p></SocialPost>
</Story>
<Story name="Thread" args={{ label: 'Conversation' }}>
 <SocialPost author={reader} date="2026-01-10T12:00:00-05:00" connected marks={[{ icon: '♥', label: 'liked', href: '#' }]}><p>The first post in a conversation.</p></SocialPost>
 <SocialPost author={casey} date="2026-01-10T12:04:00-05:00" connected sources={bluesky}><p>A reply joins it with the thread line.</p></SocialPost>
 <SocialPost author={reader} date="2026-01-10T12:09:00-05:00"><p>And the conversation keeps going.</p></SocialPost>
</Story>
<!-- Filling a fixed box, as a block on a table: no outer margin, and what doesn't fit fades out at the bottom. -->
<Story name="Fill" asChild>
  <div style="width: 360px; height: 160px">
   <SocialCard fill><SocialPost author={casey} date="2026-01-10T12:00:00-05:00" sources={bluesky}><p>A thought shared from the site, long enough that it runs past the bottom of the box it was given and has to fade out there rather than spill over the block underneath it.</p></SocialPost></SocialCard>
  </div>
</Story>
<!-- Byline off: only what was posted, as a table block with its details hidden. -->
<Story name="Content only">
 <SocialPost author={reader} date="2026-01-09T15:30:00-05:00" connected byline={false}><p>Research is a way of paying attention together.</p></SocialPost>
 <SocialPost author={casey} date="2026-01-10T12:00:00-05:00" sources={bluesky} byline={false}><p>This resonates with how I think about research.</p></SocialPost>
</Story>
