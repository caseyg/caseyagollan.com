<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import SocialPost from './SocialPost.svelte';
 import { siteAuthor } from '$lib/social-card';
 const { Story } = defineMeta({title:'Posts/SocialPost',component:SocialPost});
 const casey = {...siteAuthor, handle: '@caseyagollan.com'};
 const reader = {name: 'Example Reader', handle: '@example.bsky.social', url: 'https://bsky.app/profile/example.bsky.social'};
 const bluesky = [{url: 'https://bsky.app/profile/caseyagollan.com/post/1', label: '🦋', title: 'View on Bluesky'}];
</script>

<Story name="Connected pair">
 <SocialPost author={reader} date="2026-10-03T20:21:27Z" url="https://bsky.app/" connected sources={bluesky}><p>Okay. I might be back on the internet.</p></SocialPost>
 <SocialPost hEntry author={casey} date="2026-10-03T21:11:48Z" url="/2026/10/03/reply/" sources={bluesky} editHref="/2026/10/03/reply/edit/"><p>cordy hiiiiii! 🫶</p></SocialPost>
</Story>

<Story name="Replying to an unsaved post">
 <SocialPost hEntry author={casey} date="2026-10-03T21:11:48Z" url="/2026/10/03/reply/" sources={bluesky}>
  {#snippet context()}Replying to <a href="https://bsky.app/">@example.bsky.social</a>{/snippet}
  <p>A reply whose parent post was not saved.</p>
 </SocialPost>
</Story>

<Story name="With marks">
 <SocialPost author={reader} date="2026-10-03T20:21:27Z" sources={bluesky} marks={[{icon: '♥', label: 'liked', href: '#'}, {icon: '🔁', label: 'reposted', href: '#'}]}><p>Likes and reposts show as small marks after the time.</p></SocialPost>
</Story>

<Story name="Long name and handle">
 <SocialPost author={{...reader, name: 'Someone With A Very Long Display Name Indeed', handle: '@a-very-long-handle-that-wraps.bsky.social'}} date="2026-10-03T20:21:27Z" sources={bluesky}><p>Meta lines wrap on narrow screens.</p></SocialPost>
</Story>
